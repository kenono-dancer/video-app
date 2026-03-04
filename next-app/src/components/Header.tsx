"use client";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

import { RotateCw } from "lucide-react";

interface HeaderProps {
    viewMode: "latest" | "dancer" | "dance";
    onViewChange: (mode: "latest" | "dancer" | "dance") => void;
    onSearchChange: (query: string) => void;
}

export default function Header({ viewMode, onViewChange, onSearchChange }: HeaderProps) {
    const tabs = [
        { id: "latest", label: "Latest" },
        { id: "dancer", label: "By Dancer" },
        { id: "dance", label: "By Dance" },
    ] as const;

    const handleReload = () => {
        window.location.reload();
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-[110] bg-background/90 backdrop-blur-md border-b border-gray-800 px-4 py-3 shadow-md">
            <div className="max-w-7xl mx-auto flex flex-col gap-4">
                {/* Top Row: Title & Search & Reload */}
                <div className="flex justify-between items-center gap-4">
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-orange-600">
                        Video Library
                    </h1>

                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Search..."
                            className="bg-gray-800/50 border border-gray-700 rounded-full px-4 py-1.5 w-40 sm:w-64 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm transition-all"
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                        <button
                            onClick={handleReload}
                            className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                            title="Force Reload"
                        >
                            <RotateCw size={18} />
                        </button>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <nav className="flex gap-6">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onViewChange(tab.id)}
                            className={cn(
                                "text-sm font-semibold transition-all relative pb-2",
                                viewMode === tab.id
                                    ? "text-white"
                                    : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            {tab.label}
                            {viewMode === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-full" />
                            )}
                        </button>
                    ))}
                </nav>
            </div>
        </header>
    );
}
