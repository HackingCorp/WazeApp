import {
  Controller,
  Get,
  Query,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrencyService } from './currency.service';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all pricing plans with currency conversion' })
  @ApiQuery({ name: 'currency', required: false, description: 'Currency code (USD, EUR, XAF, etc.)' })
  @ApiQuery({ name: 'billing', required: false, enum: ['monthly', 'annually'], description: 'Billing period' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Pricing information retrieved successfully',
  })
  async getPricing(
    @Query('currency') currency?: string,
    @Query('billing') billing?: 'monthly' | 'annually',
  ): Promise<any> {
    const billingPeriod = billing || 'monthly';

    // Ensure plans are loaded from database
    await this.currencyService.ensurePlansLoaded();

    if (currency) {
      // Return pricing for specific currency
      const plans = {};
      for (const planId of ['FREE', 'STANDARD', 'PRO', 'ENTERPRISE']) {
        const plan = this.currencyService.getPlan(planId);
        if (!plan) continue;

        const price = await this.currencyService.getPlanPrice(planId, currency, billingPeriod);

        plans[planId] = {
          id: planId,
          name: plan.name,
          price: price.amount,
          currency: price.currency,
          symbol: price.symbol,
          messages: plan.messages,
          agents: plan.agents,
          storage: plan.storage,
          priceFormatted: `${price.symbol}${price.amount.toLocaleString()}`,
          yearlyTotal: price.yearlyTotal, // Total annual price for annual billing
        };
      }

      return {
        success: true,
        currency: currency.toUpperCase(),
        billingPeriod,
        plans,
      };
    }

    // Return pricing for all currencies
    const allPricing = await this.currencyService.getAllPricing(billingPeriod);
    return {
      success: true,
      ...allPricing,
    };
  }

  @Get('currencies')
  @Public()
  @ApiOperation({ summary: 'Get list of supported currencies' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Currencies list retrieved successfully',
  })
  getCurrencies(): any {
    return {
      success: true,
      currencies: this.currencyService.getSupportedCurrencies(),
    };
  }

  @Get('rates')
  @Public()
  @ApiOperation({ summary: 'Get current exchange rates' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Exchange rates retrieved successfully',
  })
  async getExchangeRates(): Promise<any> {
    const rates = await this.currencyService.getCurrentRates();
    return {
      success: true,
      base: rates.base,
      lastUpdated: rates.lastUpdated,
      margin: '10%',
      rates: Object.fromEntries(
        this.currencyService.SUPPORTED_CURRENCIES.map(code => [
          code,
          {
            rate: rates.rates[code] || 1,
            rateWithMargin: (rates.rates[code] || 1) * 1.1,
            symbol: this.currencyService.getCurrencySymbol(code),
          },
        ])
      ),
    };
  }

  @Get('convert')
  @Public()
  @ApiOperation({ summary: 'Convert amount from USD to target currency' })
  @ApiQuery({ name: 'amount', required: true, description: 'Amount in USD' })
  @ApiQuery({ name: 'to', required: true, description: 'Target currency code' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversion result',
  })
  async convert(
    @Query('amount') amount: string,
    @Query('to') targetCurrency: string,
  ): Promise<any> {
    const amountUSD = parseFloat(amount);

    if (isNaN(amountUSD) || amountUSD < 0) {
      return {
        success: false,
        error: 'Invalid amount',
      };
    }

    const converted = await this.currencyService.convertFromUSD(amountUSD, targetCurrency);
    const symbol = this.currencyService.getCurrencySymbol(targetCurrency);

    return {
      success: true,
      from: {
        amount: amountUSD,
        currency: 'USD',
        symbol: '$',
      },
      to: {
        amount: converted,
        currency: targetCurrency.toUpperCase(),
        symbol,
        formatted: `${symbol}${converted.toLocaleString()}`,
      },
      marginApplied: '10%',
    };
  }

  @Get('plan/:planId')
  @Public()
  @ApiOperation({ summary: 'Get specific plan pricing' })
  @ApiQuery({ name: 'currency', required: false, description: 'Currency code' })
  @ApiQuery({ name: 'billing', required: false, enum: ['monthly', 'annually'] })
  async getPlanPricing(
    @Query('planId') planId: string,
    @Query('currency') currency: string = 'USD',
    @Query('billing') billing: 'monthly' | 'annually' = 'monthly',
  ): Promise<any> {
    try {
      // Ensure plans are loaded from database
      await this.currencyService.ensurePlansLoaded();

      const plan = this.currencyService.getPlan(planId);

      if (!plan) {
        return {
          success: false,
          error: `Plan ${planId} not found`,
        };
      }

      const price = await this.currencyService.getPlanPrice(planId, currency, billing);

      return {
        success: true,
        plan: {
          id: plan.id,
          name: plan.name,
          price: price.amount,
          currency: price.currency,
          symbol: price.symbol,
          priceFormatted: `${price.symbol}${price.amount.toLocaleString()}`,
          billingPeriod: billing,
          features: {
            messages: plan.messages,
            agents: plan.agents,
            storage: plan.storage,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
