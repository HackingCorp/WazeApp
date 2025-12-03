import { Controller, Post, Body, Get } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";

// Mock user database
const mockUsers = [
  {
    id: "1",
    email: "admin@wazeapp.com",
    password: "Admin123!", // En prod, serait hashé
    firstName: "Admin",
    lastName: "User",
    role: "admin",
  },
  {
    id: "2",
    email: "test@example.com",
    password: "TestPassword123!",
    firstName: "Test",
    lastName: "User",
    role: "user",
  },
];

@ApiTags("Authentication (Standalone)")
@Controller("auth")
export class AuthStandaloneController {
  constructor(private jwtService: JwtService) {}

  @Post("login")
  @ApiOperation({ summary: "Login with email/password (mock)" })
  @ApiResponse({ status: 200, description: "Login successful" })
  async login(@Body() loginDto: { email: string; password: string }) {
    const { email, password } = loginDto;

    // Mock authentication - trouve l'utilisateur
    const user = mockUsers.find(
      (u) => u.email === email && u.password === password,
    );

    if (!user) {
      return {
        success: false,
        message: "Invalid credentials",
        hint: "Try: admin@wazeapp.com / Admin123! or test@example.com / TestPassword123!",
      };
    }

    // Génère un JWT
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      success: true,
      message: "Login successful (mock authentication)",
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      expiresIn: 3600,
    };
  }

  @Post("register")
  @ApiOperation({ summary: "Register new user (mock)" })
  @ApiResponse({ status: 201, description: "User registered successfully" })
  async register(@Body() registerDto: any) {
    return {
      success: true,
      message: "User registration successful (mock)",
      user: {
        id: Date.now().toString(),
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: "user",
        emailVerified: false,
      },
      note: "This is a mock registration - no data is actually stored",
    };
  }

  @Get("users")
  @ApiOperation({ summary: "Get mock users list" })
  getUsers() {
    return {
      success: true,
      users: mockUsers.map(({ password, ...user }) => user), // Retire les mots de passe
      note: "These are mock users for testing",
    };
  }
}
