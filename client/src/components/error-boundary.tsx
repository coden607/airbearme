import React, { Component, ErrorInfo, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, RefreshCcw, Bug } from "lucide-react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
        
        // Log error details for debugging
        if (import.meta.env.DEV) {
            console.group("[ErrorBoundary] Error Details");
            console.error("Error:", error);
            console.error("Error Info:", errorInfo);
            console.error("Stack:", error.stack);
            console.groupEnd();
        }
    }

    private handleReload = () => {
        try {
            window.location.reload();
        } catch (reloadError) {
            console.error("[ErrorBoundary] Reload failed:", reloadError);
            // Fallback navigation
            window.location.href = '/';
        }
    };

    private handleGoHome = () => {
        window.location.href = '/';
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[50vh] flex items-center justify-center p-6">
                    <Card className="w-full max-w-md bg-black/40 border-red-500/50 backdrop-blur-md">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center text-red-400">
                                    <Bug className="mr-2 h-5 w-5" />
                                    Application Error
                                </CardTitle>
                                <div className="text-xs text-muted-foreground">
                                    Error ID: {Date.now()}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                We've encountered an unexpected error. Don't worry, your data is safe.
                            </p>
                            
                            {this.state.error && (
                                <div className="bg-red-500/10 p-3 rounded-md text-xs font-mono text-red-200/70 overflow-x-auto">
                                    <div className="font-semibold mb-1">Error Message:</div>
                                    {this.state.error.message}
                                    {import.meta.env.DEV && this.state.error.stack && (
                                        <>
                                            <div className="font-semibold mt-2 mb-1">Stack Trace:</div>
                                            <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                                        </>
                                    )}
                                </div>
                            )}
                            
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={this.handleReload}
                                    className="w-full flex items-center justify-center space-x-2 bg-[#10b981] text-white py-2 rounded-md hover:opacity-90 transition-opacity"
                                >
                                    <RefreshCcw className="h-4 w-4" />
                                    <span>Reload Application</span>
                                </button>
                                
                                <button
                                    onClick={this.handleGoHome}
                                    className="w-full flex items-center justify-center space-x-2 bg-gray-600 text-white py-2 rounded-md hover:opacity-90 transition-opacity"
                                >
                                    <AlertCircle className="h-4 w-4" />
                                    <span>Go to Home</span>
                                </button>
                            </div>
                            
                            <p className="text-xs text-muted-foreground text-center">
                                If this error persists, please contact support with the error details above.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
