"use client";

import { useEffect, useRef, useState } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface AlphabetIndexProps {
    items: string[];
    activeChar?: string;
    onSelect?: (char: string) => void;
}

export default function AlphabetIndex({ items, activeChar, onSelect }: AlphabetIndexProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [localActive, setLocalActive] = useState<string | null>(null);
    const [observerActive, setObserverActive] = useState<string | null>(null);

    // IntersectionObserver to track scroll position
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.id.replace("anchor-", "");
                        setObserverActive(id);
                    }
                });
            },
            { threshold: 0.1, rootMargin: "-10% 0px -80% 0px" }
        );

        // Find all anchors
        items.forEach((id) => {
            const el = document.getElementById(`anchor-${id}`);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [items]);

    const handlePointer = (e: React.PointerEvent) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        // Calculate relative position (0 to 1)
        let relativeY = y / height;
        relativeY = Math.max(0, Math.min(1, relativeY)); // Clamp

        // Map to item index
        const index = Math.floor(relativeY * items.length);
        const char = items[index >= items.length ? items.length - 1 : index];

        if (e.cancelable && e.type !== "pointerup") {
            e.preventDefault();
        }

        if (char && char !== localActive) {
            setLocalActive(char);
            if (window.navigator.vibrate) window.navigator.vibrate(5);
            onSelect?.(char);
        }
    };

    const handlePointerUp = () => {
        setLocalActive(null);
    };

    const isLatestMode = items.some(i => i.startsWith("Latest-"));
    // Priority: localActive (tactile) > observerActive (automatic) > activeChar (prop)
    const currentActive = localActive || observerActive || activeChar;

    if (items.length === 0) {
        return (
            <div className="fixed right-4 top-36 z-[100] w-1 h-[calc(100vh-200px)] bg-white/5 rounded-full pointer-events-none" />
        );
    }

    // For Latest mode, we want a clean track and a single moving "shiori"
    // For other modes, we keep the discrete mapping for letters
    return (
        <div
            ref={containerRef}
            className={cn(
                "fixed right-2 z-[100] flex flex-col items-center py-4 px-1 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-2xl no-scrollbar select-none touch-none transition-all duration-300",
                "top-40 bottom-8 w-10 justify-between",
                isLatestMode ? "opacity-60 hover:opacity-100" : "overflow-y-auto"
            )}
            onPointerDown={handlePointer}
            onPointerMove={handlePointer}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            {
                isLatestMode ? (
                    <div className="relative w-full h-full flex flex-col items-center" >
                        {/* Continuous Track */}
                        < div className="absolute inset-y-0 w-0.5 bg-white/10 rounded-full" />

                        {/* Floating Shiori/Indicator */}
                        {currentActive && (
                            <div
                                className="absolute left-1/2 -translate-x-1/2 w-8 h-2 bg-orange-500 rounded-full shadow-lg shadow-orange-500/50 transition-all duration-100 ease-out flex items-center justify-center"
                                style={{
                                    top: `${Math.max(0, Math.min(100, (items.indexOf(currentActive) / (items.length - 1)) * 100))}%`,
                                    transform: 'translateX(-50%) translateY(-50%)'
                                }}
                            >
                                {currentActive === "footer" && <span className="text-[8px] text-white">↓</span>}
                            </div>
                        )}
                    </div >
                ) : (
                    items.map((char) => {
                        const isActive = currentActive === char;
                        const isFooter = char === "footer";

                        return (
                            <div
                                key={char}
                                data-char={char}
                                className={cn(
                                    "flex items-center justify-center transition-all duration-100 cursor-pointer pointer-events-auto",
                                    "w-8 h-6 text-[10px] font-bold",
                                    isActive
                                        ? isFooter
                                            ? "bg-orange-500 w-6 h-1 rounded-full scale-125 shadow-lg shadow-orange-500/50"
                                            : "bg-orange-500 text-white rounded-full scale-125 shadow-lg shadow-orange-500/50"
                                        : isFooter
                                            ? "bg-white/10 w-4 h-0.5 rounded-full hover:bg-white/30"
                                            : "text-gray-400 hover:text-white"
                                )}
                            >
                                {isFooter ? (
                                    <div className={cn("transition-transform", isActive ? "scale-125 text-white" : "text-gray-500")}>
                                        ↓
                                    </div>
                                ) : (
                                    (char.length > 2 ? char.slice(0, 2) : char)
                                )}
                            </div>
                        );
                    })
                )}
        </div >
    );
}
