import { Controller, Get, Post, Body } from "@nestjs/common";

@Controller("health")
export class HealthMinimalController {
  @Get()
  check() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "WazeApp",
      version: "1.0.0",
    };
  }

  @Get("live")
  live() {
    return { status: "alive", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  ready() {
    return { status: "ready", timestamp: new Date().toISOString() };
  }
}

@Controller("auth")
export class AuthMinimalController {
  @Post("register")
  register(@Body() body: any) {
    return {
      success: true,
      message: "Registration endpoint working",
      data: body,
      timestamp: new Date().toISOString(),
    };
  }

  @Post("login")
  login(@Body() body: any) {
    return {
      success: true,
      message: "Login endpoint working",
      token: "fake-jwt-token-for-testing",
      user: { id: 1, email: body.email },
      timestamp: new Date().toISOString(),
    };
  }
}
