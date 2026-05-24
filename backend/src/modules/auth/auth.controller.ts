import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Req,
  Res,
  Query,
  Patch,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import {
  RegisterDto,
  LoginDto,
  AuthResponseDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
  RefreshTokenDto,
} from "./dto/auth.dto";
import { Public } from "@/common/decorators/public.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { LocalAuthGuard } from "@/common/guards/local-auth.guard";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute - prevent mass account creation
  @ApiOperation({ summary: "Register new user" })
  @ApiResponse({
    status: 201,
    description: "User registered successfully",
    type: AuthResponseDto,
  })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute - prevent brute force
  @ApiOperation({ summary: "Login user" })
  @ApiResponse({
    status: 200,
    description: "Login successful",
    type: AuthResponseDto,
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: any,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post("refresh")
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute - more lenient for token refresh
  @ApiOperation({ summary: "Refresh access token" })
  @ApiResponse({
    status: 200,
    description: "Token refreshed",
    type: AuthResponseDto,
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshToken(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @ApiOperation({ summary: "Logout user and invalidate refresh token" })
  @ApiResponse({ status: 200, description: "Logout successful" })
  async logout(@CurrentUser() user: any): Promise<{ message: string }> {
    await this.authService.logout(user.userId);
    return { message: "Logout successful" };
  }

  @UseGuards(JwtAuthGuard)
  @Post("create-redirect-code")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Create a temporary redirect code for cross-domain auth" })
  @ApiResponse({ status: 200, description: "Redirect code generated" })
  async createRedirectCode(
    @CurrentUser() user: any,
  ): Promise<{ code: string }> {
    const userId = user.userId || user.sub || user.id;
    const code = await this.authService.createRedirectCode(
      userId,
      user.organizationId,
      user.role,
    );
    return { code };
  }

  @Public()
  @Post("forgot-password")
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 requests per 5 minutes - prevent email spam
  @ApiOperation({ summary: "Request password reset" })
  @ApiResponse({ status: 200, description: "Password reset email sent" })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto);
    return {
      message: "If your email exists, you will receive a password reset link",
    };
  }

  @Public()
  @Post("reset-password")
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute - prevent token brute force
  @ApiOperation({ summary: "Reset password with token" })
  @ApiResponse({ status: 200, description: "Password reset successfully" })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto);
    return { message: "Password reset successfully" };
  }

  @Public()
  @Post("verify-email")
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 requests per 5 minutes - prevent token brute force
  @ApiOperation({ summary: "Verify email address" })
  @ApiResponse({ status: 200, description: "Email verified successfully" })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    await this.authService.verifyEmail(dto);
    return { message: "Email verified successfully" };
  }

  @Public()
  @Post("resend-verification")
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 requests per 5 minutes - prevent email spam
  @ApiOperation({ summary: "Resend email verification" })
  @ApiResponse({ status: 200, description: "Verification email sent" })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    await this.authService.resendVerification(dto.email);
    return { message: "Verification email sent" };
  }

  @UseGuards(JwtAuthGuard)
  @Patch("onboarding-step")
  @ApiOperation({ summary: "Update onboarding step" })
  @ApiResponse({ status: 200, description: "Onboarding step updated" })
  async updateOnboardingStep(
    @CurrentUser() user: any,
    @Body() body: { step: number | null },
  ) {
    await this.authService.updateOnboardingStep(user.userId, body.step);
    return { message: "OK" };
  }

  // Profile endpoints
  @UseGuards(JwtAuthGuard)
  @Get("profile")
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({ status: 200, description: "Profile retrieved successfully" })
  async getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("profile")
  @ApiOperation({ summary: "Update current user profile" })
  @ApiResponse({ status: 200, description: "Profile updated successfully" })
  async updateProfile(@CurrentUser() user: any, @Body() updateData: any) {
    return this.authService.updateProfile(user.userId, updateData);
  }

  // OAuth Routes
  @Public()
  @Get("google")
  @UseGuards(AuthGuard("google"))
  @ApiOperation({ summary: "Google OAuth login" })
  async googleAuth() {
    // Initiates Google OAuth flow
  }

  @Public()
  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  @ApiOperation({ summary: "Google OAuth callback" })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.handleOAuthUser(req.user, "google");

    // Generate temporary auth code instead of exposing tokens in URL
    const tempCode = this.authService.generateTempCode({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    // Redirect to frontend with temporary code only
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?code=${tempCode}`;
    res.redirect(redirectUrl);
  }

  @Public()
  @Get("microsoft")
  @UseGuards(AuthGuard("microsoft"))
  @ApiOperation({ summary: "Microsoft OAuth login" })
  async microsoftAuth() {
    // Initiates Microsoft OAuth flow
  }

  @Public()
  @Get("microsoft/callback")
  @UseGuards(AuthGuard("microsoft"))
  @ApiOperation({ summary: "Microsoft OAuth callback" })
  async microsoftCallback(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.handleOAuthUser(
      req.user,
      "microsoft",
    );

    // Generate temporary auth code instead of exposing tokens in URL
    const tempCode = this.authService.generateTempCode({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    // Redirect to frontend with temporary code only
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?code=${tempCode}`;
    res.redirect(redirectUrl);
  }

  @Public()
  @Get("facebook")
  @UseGuards(AuthGuard("facebook"))
  @ApiOperation({ summary: "Facebook OAuth login" })
  async facebookAuth() {
    // Initiates Facebook OAuth flow
  }

  @Public()
  @Get("facebook/callback")
  @UseGuards(AuthGuard("facebook"))
  @ApiOperation({ summary: "Facebook OAuth callback" })
  async facebookCallback(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.handleOAuthUser(req.user, "facebook");

    // Generate temporary auth code instead of exposing tokens in URL
    const tempCode = this.authService.generateTempCode({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    // Redirect to frontend with temporary code only
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?code=${tempCode}`;
    res.redirect(redirectUrl);
  }

  @Public()
  @Post("exchange-code")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @ApiOperation({ summary: "Exchange temporary auth code for tokens" })
  @ApiResponse({
    status: 200,
    description: "Tokens exchanged successfully",
  })
  async exchangeCode(
    @Body("code") code: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!code) {
      throw new BadRequestException("Auth code is required");
    }
    return this.authService.exchangeTempCode(code);
  }
}
