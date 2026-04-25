import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Users, Home, LogOut } from 'lucide-react';

const sidebarItems = [
    { icon: Home, label: 'Dashboard', href: '/' },
    { icon: Users, label: 'Users', href: '/users' },
];

export function Sidebar() {
    const location = useLocation();

    return (
        <aside className="w-64 bg-card border-r h-screen flex flex-col">
            <div className="p-6 border-b">
                <h1 className="text-2xl font-bold text-primary">My App</h1>
            </div>
            <nav className="flex-1 p-4 space-y-2">
                {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            to={item.href}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                                isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="font-medium">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
            <div className="p-4 border-t">
                <button className="flex items-center gap-3 px-4 py-3 w-full rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Logout</span>
                </button>
            </div>
        </aside>
    );
}
