import { Bell, Search } from 'lucide-react';

export function Navbar() {
    return (
        <header className="h-16 border-b bg-card flex items-center justify-between px-6">
            <div className="flex items-center gap-4 w-96">
                <div className="relative w-full">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full bg-background border rounded-md pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
            </div>
            <div className="flex items-center gap-4">
                <button className="p-2 hover:bg-accent rounded-full">
                    <Bell className="w-5 h-5 text-muted-foreground" />
                </button>
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">
                    U
                </div>
            </div>
        </header>
    );
}
