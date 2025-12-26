"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { OnboardingForm } from "@/components/onboarding-form"
import { Settings, LogOut } from "lucide-react"

export function UserNav() {
    const [user, setUser] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [profileData, setProfileData] = useState<any>(null)
    const [loadingSettings, setLoadingSettings] = useState(false)

    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        const getUser = async () => {
            // Use getSession first as it reads from cookies directly
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
                setUser(session.user)
            }
            setIsLoading(false)
        }
        getUser()
    }, [])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push("/login")
    }

    const openSettings = async () => {
        setSettingsOpen(true)
        setLoadingSettings(true)

        // Fetch latest profile data
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            setProfileData(data)
        }
        setLoadingSettings(false)
    }

    // Show placeholder while loading
    if (isLoading) {
        return (
            <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
        )
    }

    if (!user) return null

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                        <Avatar className="h-9 w-9">
                            <AvatarImage src={user.user_metadata?.avatar_url} alt={user.email} />
                            <AvatarFallback>{user.email?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium leading-none">Account</p>
                            <p className="text-xs leading-none text-muted-foreground">
                                {user.email}
                            </p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                        <DropdownMenuItem onClick={openSettings}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>User Settings</DialogTitle>
                        <DialogDescription>
                            Manage your API keys, email templates, and attachments.
                        </DialogDescription>
                    </DialogHeader>

                    {loadingSettings ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">Loading settings...</div>
                    ) : (
                        <div className="pt-4">
                            <OnboardingForm initialData={profileData} />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
