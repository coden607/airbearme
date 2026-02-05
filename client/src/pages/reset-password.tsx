import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase-client";
import { AirBearMascot } from "@/components/airbear-mascot";
import { Eye, EyeOff, Lock, Loader2, CheckCircle } from "lucide-react";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  // Check if we have a valid session from the email link
  useEffect(() => {
    const checkSession = async () => {
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast({
            title: "Invalid or Expired Link",
            description: "Please request a new password reset link.",
            variant: "destructive",
          });
        }
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsResetting(true);

    try {
      if (supabase) {
        // Use Supabase to update password
        const { error } = await supabase.auth.updateUser({
          password: formData.password,
        });

        if (error) throw error;
      } else {
        // Fallback: Use our API endpoint
        // Get email from URL or session
        const urlParams = new URLSearchParams(window.location.search);
        const email = urlParams.get('email');

        if (!email) {
          throw new Error("Email not found. Please request a new reset link.");
        }

        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            newPassword: formData.password,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || 'Failed to reset password');
        }
      }

      setResetComplete(true);
      toast({
        title: "Password Reset Successful",
        description: "You can now sign in with your new password.",
      });

      // Redirect after 2 seconds
      setTimeout(() => navigate('/auth'), 2000);
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        title: "Reset Failed",
        description: error.message || "Unable to reset password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (resetComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full"
        >
          <Card className="glass-morphism shadow-2xl border-primary/20">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Password Reset!</h2>
              <p className="text-muted-foreground">
                Your password has been reset successfully. Redirecting to sign in...
              </p>
              <Button
                onClick={() => navigate('/auth')}
                className="eco-gradient text-white w-full"
              >
                Go to Sign In
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-md w-full"
      >
        <Card className="glass-morphism shadow-2xl border-primary/20">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              <AirBearMascot size="xl" className="rounded-full border-2 border-primary/30" />
            </div>
            <CardTitle className="text-2xl">Reset Your Password</CardTitle>
            <CardDescription>
              Enter your new password below
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center">
                  <Lock className="w-4 h-4 mr-2" />
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter new password"
                    required
                    minLength={6}
                    className="focus:ring-primary pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
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
                <Label htmlFor="confirmPassword" className="flex items-center">
                  <Lock className="w-4 h-4 mr-2" />
                  Confirm New Password
                </Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm new password"
                  required
                  minLength={6}
                  className="focus:ring-primary"
                />
              </div>

              <Button
                type="submit"
                disabled={isResetting}
                className="w-full eco-gradient text-white hover-lift"
              >
                {isResetting ? (
                  <div className="flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting Password...
                  </div>
                ) : (
                  "Reset Password"
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/auth')}
                className="w-full"
              >
                Back to Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
