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
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
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
  @ApiOperation({ summary: "Refresh access token" })
  @ApiResponse({
    status: 200,
    description: "Token refreshed",
    type: AuthResponseDto,
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshToken(dto);
  }

  @Public()
  @Post("forgot-password")
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
  @ApiOperation({ summary: "Verify email address" })
  @ApiResponse({ status: 200, description: "Email verified successfully" })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    await this.authService.verifyEmail(dto);
    return { message: "Email verified successfully" };
  }

  @Public()
  @Post("resend-verification")
  @ApiOperation({ summary: "Resend email verification" })
  @ApiResponse({ status: 200, description: "Verification email sent" })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    await this.authService.resendVerification(dto.email);
    return { message: "Verification email sent" };
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

    // Redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${result.accessToken}&refresh=${result.refreshToken}`;
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

    // Redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${result.accessToken}&refresh=${result.refreshToken}`;
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

    // Redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${result.accessToken}&refresh=${result.refreshToken}`;
    res.redirect(redirectUrl);
  }
}
