"use client"

import { OnboardingForm } from "@/components/onboarding-form"
import { UserNav } from "@/components/user-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"

export function OnboardingContent() {
    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-card">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center">
                                <Image
                                    src="/logo.png"
                                    alt="Venture Strategy Solutions"
                                    width={40}
                                    height={40}
                                    className="h-10 w-10 object-contain"
                                />
                            </div>
                            <div>
                                <h1 className="text-lg font-semibold text-foreground">Venture Strategy Solutions</h1>
                                <p className="text-sm text-muted-foreground">Intelligence Platform</p>
                            </div>
                        </div>

                        <UserNav />
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-8">
                <Card className="mx-auto max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-2xl">Welcome to Venture Sourcer</CardTitle>
                        <CardDescription>
                            Let&apos;s set up your preferences to help the agent work effectively.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <OnboardingForm isOnboarding={true} />
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
