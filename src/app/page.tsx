import { CompanySearchTab } from "@/components/company-search-tab"
import { PeopleLookupTab } from "@/components/people-lookup-tab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Users } from "lucide-react"
import Image from "next/image"

export default function Home() {
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
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="company-search" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="company-search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Company Search
            </TabsTrigger>
            <TabsTrigger value="people-lookup" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              People Lookup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company-search" className="mt-6">
            <CompanySearchTab />
          </TabsContent>

          <TabsContent value="people-lookup" className="mt-6">
            <PeopleLookupTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
