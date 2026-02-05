
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { assertSupabase, supabase } from "@/lib/supabase-client";
import AirbearWheel from "@/components/airbear-wheel";
import { AirBearMascot } from "@/components/airbear-mascot";
import LoadingSpinner from "@/components/loading-spinner";
import { Eye, EyeOff, Mail, Lock, User, Loader2, ArrowLeft, CheckCircle } from "lucide-react";

export default function Auth() {
  const [, navigate] = useLocation();
  const { login, register, isLoading, user } = useAuth();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    username: "",
    role: "user" as "user" | "driver" | "admin",
  });

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  // Handle password reset request
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetEmail || !resetEmail.includes("@")) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsResettingPassword(true);

    try {
      // Try Supabase password reset first
      if (supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
          redirectTo: `${window.location.origin}/auth/reset-password`,
        });

        if (error) throw error;
      } else {
        // Fallback: Call our API endpoint
        const response = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resetEmail }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to send reset email');
        }
      }

      setResetEmailSent(true);
      toast({
        title: "Reset Email Sent",
        description: "Check your inbox for password reset instructions",
      });
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        title: "Reset Failed",
        description: error.message || "Unable to send reset email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Get redirect URL from query params
  const getRedirectUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('redirect') || '/dashboard';
  };

  useEffect(() => {
    if (user) {
      const redirectUrl = getRedirectUrl();
      navigate(redirectUrl);
    }
  }, [user, navigate]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      const { data, error } = await assertSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
      
      toast({
        title: "Google Sign-In",
        description: "Redirecting to Google...",
      });
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      toast({
        title: "Google Sign-In Failed",
        description: error.message || "Unable to sign in with Google",
        variant: "destructive",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setIsAppleLoading(true);
      const { data, error } = await assertSupabase().auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
      
      toast({
        title: "Apple Sign-In",
        description: "Redirecting to Apple...",
      });
    } catch (error: any) {
      console.error('Apple sign-in error:', error);
      toast({
        title: "Apple Sign-In Failed",
        description: error.message || "Unable to sign in with Apple",
        variant: "destructive",
      });
    } finally {
      setIsAppleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (mode === "signup") {
        // Additional client-side validation
        if (!formData.username || formData.username.length < 2) {
          throw new Error("Username must be at least 2 characters");
        }

        if (!formData.email || !formData.email.includes("@")) {
          throw new Error("Please enter a valid email address");
        }

        if (formData.password !== formData.confirmPassword) {
          throw new Error("Passwords do not match");
        }

        if (formData.password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }

        await register(formData);

        toast({
          title: "Account created!",
          description: "Your AirBear account has been created successfully",
        });

        const redirectUrl = getRedirectUrl();
        navigate(redirectUrl);
      } else {
        if (!formData.email || !formData.password) {
          throw new Error("Please enter both email and password");
        }

        await login(formData.email, formData.password);

        toast({
          title: "Welcome back!",
          description: "You've been signed in successfully",
        });

        const redirectUrl = getRedirectUrl();
        navigate(redirectUrl);
      }
    } catch (error: any) {
      toast({
        title: mode === "signup" ? "Registration Error" : "Authentication Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="Authenticating..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-20">
        <motion.div 
          className="absolute top-1/4 left-1/4"
          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
          transition={{ duration: 8, repeat: Infinity }}
        >
          <AirbearWheel size="xl" className="opacity-30" />
        </motion.div>
        <motion.div 
          className="absolute bottom-1/4 right-1/4"
          animate={{ rotate: -360, y: [-20, 20, -20] }}
          transition={{ duration: 10, repeat: Infinity }}
        >
          <AirbearWheel size="lg" className="opacity-20" />
        </motion.div>
      </div>

      <motion.div 
        className="max-w-md w-full space-y-8 relative z-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="text-center">
          <motion.div
            className="flex justify-center mb-6"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <AirBearMascot size="4xl" className="rounded-full border-4 border-primary/30 shadow-2xl" />
          </motion.div>

          <h2 className="text-3xl font-bold text-foreground">
            Welcome to <span className="eco-gradient bg-clip-text text-transparent text-outline-strong">AirBear</span>
          </h2>
          <p className="mt-2 text-muted-foreground">
            Join the sustainable transportation revolution
          </p>
        </div>

        <Tabs defaultValue="signin" value={mode} onValueChange={(value) => setMode(value as "signin" | "signup")} className="w-full max-w-md">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-signin">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="signup" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-signup">
              Sign Up
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="signin" className="mt-6">
            <Card className="glass-morphism shadow-2xl border-primary/20" data-testid="card-signin">
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-2xl">Sign In</CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-muted" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Sign in with email</span>
                  </div>
                </div>

                {/* Email/Password Form */}
                <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email" className="flex items-center">
                      <Mail className="w-4 h-4 mr-2" />
                      Email
                    </Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      placeholder="your@email.com"
                      required
                      autoComplete="email"
                      className="focus:ring-primary"
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password" className="flex items-center">
                      <Lock className="w-4 h-4 mr-2" />
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        placeholder="Enter your password"
                        required
                        autoComplete="current-password"
                        className="focus:ring-primary pr-10"
                        data-testid="input-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full eco-gradient text-white hover-lift animate-pulse-glow ripple-effect"
                    data-testid="button-submit"
                  >
                    {isLoading ? (
                      <div className="flex items-center">
                        <AirbearWheel size="sm" className="mr-2" />
                        Signing In...
                      </div>
                    ) : (
                      <div className="flex items-center">
                        Sign In
                      </div>
                    )}
                  </Button>
                </form>
                <div className="text-center">
                  <Button
                    variant="link"
                    className="text-primary hover:text-primary/80"
                    data-testid="button-forgot-password"
                    onClick={() => {
                      setShowForgotPassword(true);
                      setResetEmail(formData.email);
                    }}
                  >
                    Forgot your password?
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="signup" className="mt-6">
            <Card className="glass-morphism shadow-2xl border-primary/20" data-testid="card-signup">
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-2xl">Sign Up</CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-muted" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Create your account</span>
                  </div>
                </div>

                {/* Registration Form */}
                <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
                  <div className="space-y-2">
                    <Label htmlFor="signup-username" className="flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      Username
                    </Label>
                    <Input
                      id="signup-username"
                      name="username"
                      type="text"
                      value={formData.username}
                      onChange={(e) => handleInputChange("username", e.target.value)}
                      placeholder="Choose a username"
                      required
                      autoComplete="username"
                      className="focus:ring-primary"
                      data-testid="input-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="flex items-center">
                      <Mail className="w-4 h-4 mr-2" />
                      Email
                    </Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      placeholder="your@email.com"
                      required
                      autoComplete="email"
                      className="focus:ring-primary"
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="flex items-center">
                      <Lock className="w-4 h-4 mr-2" />
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        placeholder="Enter your password"
                        required
                        autoComplete="new-password"
                        className="focus:ring-primary pr-10"
                        data-testid="input-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password" className="flex items-center">
                      <Lock className="w-4 h-4 mr-2" />
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="signup-confirm-password"
                        name="confirm-password"
                        type={showPassword ? "text" : "password"}
                        value={formData.confirmPassword}
                        onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                        placeholder="Confirm your password"
                        required
                        autoComplete="new-password"
                        className="focus:ring-primary pr-10"
                        data-testid="input-confirm-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role" className="flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      Role
                    </Label>
                    <select
                      id="role"
                      value={formData.role}
                      onChange={(e) => handleInputChange("role", e.target.value)}
                      className="w-full p-3 border border-input bg-background focus:ring-primary focus:border-primary"
                      data-testid="select-role"
                    >
                      <option value="user">User</option>
                      <option value="driver">Driver</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full eco-gradient text-white hover-lift animate-pulse-glow ripple-effect"
                    data-testid="button-submit"
                  >
                    {isLoading ? (
                      <div className="flex items-center">
                        <AirbearWheel size="sm" className="mr-2" />
                        Creating Account...
                      </div>
                    ) : (
                      <div className="flex items-center">
                        Sign Up
                      </div>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <Card className="w-full max-w-md mx-4 glass-morphism shadow-2xl border-primary/20">
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-4">
                    <AirBearMascot size="xl" className="rounded-full border-2 border-primary/30" />
                  </div>
                  <CardTitle className="text-2xl">
                    {resetEmailSent ? "Check Your Email" : "Reset Password"}
                  </CardTitle>
                  <CardDescription>
                    {resetEmailSent
                      ? "We've sent you a password reset link"
                      : "Enter your email to receive reset instructions"
                    }
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {resetEmailSent ? (
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                      </div>
                      <p className="text-muted-foreground">
                        We sent a password reset link to <strong className="text-foreground">{resetEmail}</strong>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Didn't receive the email? Check your spam folder or try again.
                      </p>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setResetEmailSent(false);
                          }}
                        >
                          Try Different Email
                        </Button>
                        <Button
                          onClick={() => {
                            setShowForgotPassword(false);
                            setResetEmailSent(false);
                            setResetEmail("");
                          }}
                          className="eco-gradient text-white"
                        >
                          Back to Sign In
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reset-email" className="flex items-center">
                          <Mail className="w-4 h-4 mr-2" />
                          Email Address
                        </Label>
                        <Input
                          id="reset-email"
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="your@email.com"
                          required
                          className="focus:ring-primary"
                          autoFocus
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={isResettingPassword}
                        className="w-full eco-gradient text-white hover-lift"
                      >
                        {isResettingPassword ? (
                          <div className="flex items-center">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending Reset Link...
                          </div>
                        ) : (
                          "Send Reset Link"
                        )}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowForgotPassword(false);
                          setResetEmail("");
                        }}
                        className="w-full"
                      >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Sign In
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}

        {/* OAuth Section */}
        {/* OAuth Buttons - TEMPORARILY DISABLED until configured in Supabase */}
        {false && (<div className="mt-6">
          <Card className="w-full max-w-md mx-auto">
            <CardContent className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">Or continue with</h3>
                <p className="text-sm text-muted-foreground">Quick sign-in with your social account</p>
              </div>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading || isGoogleLoading || isAppleLoading}
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting to Google...
                    </>
                  ) : (
                    <>
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                      Google
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAppleSignIn}
                  disabled={isLoading || isGoogleLoading || isAppleLoading}
                >
                  {isAppleLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting to Apple...
                    </>
                  ) : (
                    <>
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path
                          d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
                          fill="#000"
                        />
                      </svg>
                      Apple
                    </>
                  )}
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>)}

        <div className="text-center text-sm text-muted-foreground">
          By continuing, you agree to our{" "}
          <a href="/terms" className="text-primary hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </a>
        </div>
      </motion.div>
    </div>
  );
}
