"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import VideoCard from "@/components/VideoCard";
import Header from "@/components/Header";
import AlphabetIndex from "@/components/AlphabetIndex";
import EditVideoModal from "@/components/EditVideoModal";
import { Lock, Unlock } from "lucide-react";

// Types
interface Video {
    id: number;
    dancer: string;
    discipline: string;
    videoUrl: string;
    imageUrl: string;
    date: string; // Added date field
    memo?: string;
    platform?: string;
    yomi?: string;
}

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyYSqxrrowj_ks5uOl4qQbgJQrNI75eKmeOqUlxgH5yxRhvn9SqDim3_gdR9QCvHP3jzA/exec";

export default function Home() {
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [viewMode, setViewMode] = useState<"latest" | "dancer" | "dance">("latest");
    const [isAdminMode, setIsAdminMode] = useState(false);
    const [editingVideo, setEditingVideo] = useState<Video | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);

    const fetchVideos = useCallback(async () => {
        try {
            const resp = await fetch(GAS_API_URL);
            const data: Video[] = await resp.json();

            // Sort by date descending (Newest first)
            const sortedData = [...data].sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                return dateB - dateA;
            });

            setVideos(sortedData);
        } catch (err) {
            console.error("Failed to fetch videos:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchVideos();
    }, [fetchVideos]);

    // Derived Data
    const filteredVideos = useMemo(() => {
        const q = search.toLowerCase();
        return videos.map(v => ({
            ...v,
            dancer: v.dancer || "Unknown",
            discipline: v.discipline || "Unknown",
            memo: v.memo || ""
        })).filter(v =>
            v.dancer.toLowerCase().includes(q) ||
            v.discipline.toLowerCase().includes(q) ||
            v.memo.toLowerCase().includes(q)
        );
    }, [videos, search]);

    const groupedVideos = useMemo(() => {
        const groups: { [key: string]: Video[] } = {};

        if (viewMode === "dancer") {
            // Group by Dancer Initial
            filteredVideos.forEach(v => {
                const initial = v.dancer.charAt(0).toUpperCase();
                const key = /^[A-Z]$/i.test(initial) ? initial : "?";
                if (!groups[key]) groups[key] = [];
                groups[key].push(v);
            });

            return Object.keys(groups).sort((a, b) => {
                if (a === "?") return 1;
                if (b === "?") return -1;
                return a.localeCompare(b);
            }).map(key => ({
                key,
                videos: groups[key]
            }));
        } else if (viewMode === "dance") {
            // Group by Discipline (WTVFQ?)
            const disciplineMap: { [key: string]: string } = {
                "ワルツ": "W", "Waltz": "W", "W": "W",
                "タンゴ": "T", "Tango": "T", "T": "T",
                "ヴェニーズワルツ": "V", "Viennese Waltz": "V", "V": "V",
                "スローフォックストロット": "F", "Slow Foxtrot": "F", "F": "F",
                "クイックステップ": "Q", "Quickstep": "Q", "Q": "Q",
                "チャチャチャ": "C", "Cha Cha Cha": "C",
                "サンバ": "S", "Samba": "S",
                "ルンバ": "R", "Rumba": "R",
                "パソドブレ": "P", "Paso Doble": "P",
                "ジャイブ": "J", "Jive": "J"
            };

            filteredVideos.forEach(v => {
                const d = v.discipline;
                const key = disciplineMap[d] || d.charAt(0).toUpperCase() || "?";
                if (!groups[key]) groups[key] = [];
                groups[key].push(v);
            });

            const order = ["W", "T", "V", "F", "Q"];
            return Object.keys(groups).sort((a, b) => {
                const idxA = order.indexOf(a);
                const idxB = order.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.localeCompare(b);
            }).map(key => ({
                key,
                videos: groups[key]
            }));
        } else {
            // "Latest" - Chunk into segments for fast scroll
            const chunkSize = 12;
            const result = [];
            for (let i = 0; i < filteredVideos.length; i += chunkSize) {
                result.push({
                    key: `Latest-${Math.floor(i / chunkSize)}`,
                    videos: filteredVideos.slice(i, i + chunkSize)
                });
            }
            return result.length > 0 ? result : [{ key: "Latest", videos: [] }];
        }
    }, [filteredVideos, viewMode]);

    const indexItems = useMemo(() => {
        let items: string[] = [];
        if (viewMode === "dance") {
            items = ["W", "T", "V", "F", "Q", "?"];
        } else if (viewMode === "dancer") {
            items = "ABCDEFGHIJKLMNOPQRSTUVWXYZ?".split("");
        } else if (viewMode === "latest") {
            items = groupedVideos.map(g => g.key);
        }

        // Add footer to all modes for quick access to the bottom
        if (items.length > 0) {
            items.push("footer");
        }
        return items;
    }, [viewMode, groupedVideos]);

    const handleAlphabetSelect = (char: string) => {
        const isSingleLetter = /^[A-Z]$/.test(char);
        if (viewMode === "latest" && isSingleLetter) {
            setViewMode("dancer");
            // Need to allow React to re-render the groups before scrolling
            setTimeout(() => {
                const anchor = document.getElementById(`anchor-${char}`);
                if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
        } else {
            const anchor = document.getElementById(`anchor-${char}`);
            if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    const handleAdminToggle = () => {
        if (isAdminMode) {
            setIsAdminMode(false);
        } else {
            const pass = prompt("Enter Admin Password:");
            if (pass === "1557") {
                setIsAdminMode(true);
            } else if (pass !== null) {
                alert("Incorrect Password");
            }
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncStatus("Syncing with Google Spreadsheet...");
        try {
            const resp = await fetch(`${GAS_API_URL}?action=sync`);
            if (!resp.ok) {
                throw new Error(`HTTP error! status: ${resp.status}`);
            }
            const result = await resp.json();
            if (result.success) {
                setSyncStatus("Sync Completed successfully!");
                await fetchVideos(); // Re-fetch to load new videos
            } else {
                throw new Error(result.error || "Unknown error during sync");
            }
        } catch (err: any) {
            console.error("Sync failed:", err);
            setSyncStatus(`Sync Failed: ${err.message || "Network error"}`);
        } finally {
            setIsSyncing(false);
            setTimeout(() => setSyncStatus(null), 5000);
        }
    };

    const handleSaveVideo = (updatedVideo: Video) => {
        setVideos(prev => prev.map(v => v.id === updatedVideo.id ? updatedVideo : v));
    };

    return (
        <div className="min-h-screen bg-background">
            <Header
                viewMode={viewMode}
                onViewChange={setViewMode}
                onSearchChange={setSearch}
            />

            <main className="max-w-7xl mx-auto pl-4 pr-16 pt-36 pb-8 relative">
                <AlphabetIndex items={indexItems} onSelect={handleAlphabetSelect} />

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {groupedVideos.map((group) => {
                            // Map single letters to full names for display in headers
                            const danceDisplayNames: { [key: string]: string } = {
                                "W": "Waltz",
                                "T": "Tango",
                                "V": "Viennese",
                                "F": "Slowfox",
                                "Q": "Quickstep",
                                "?": "other"
                            };
                            const displayName = viewMode === "dance"
                                ? (danceDisplayNames[group.key] || group.key)
                                : group.key;

                            return (
                                <section key={group.key} id={`anchor-${group.key}`} className="scroll-mt-40">
                                    {/* Only show header for dancer/dance view or the very first Latest chunk */}
                                    {(viewMode !== "latest" || group.key === "Latest-0") && (
                                        <div className="flex items-center gap-4 mb-6">
                                            <h2 className="text-2xl font-bold text-white">
                                                {viewMode === "latest" ? "Latest" : displayName}
                                            </h2>
                                            <div className="flex-1 h-px bg-gray-800" />
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {group.videos.map((video) => (
                                            <VideoCard
                                                key={video.id}
                                                dancer={video.dancer}
                                                discipline={video.discipline}
                                                imageUrl={video.imageUrl}
                                                videoUrl={video.videoUrl}
                                                memo={video.memo}
                                                platform={video.platform}
                                                onEdit={isAdminMode ? () => setEditingVideo(video) : undefined}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )
                        })}
                    </div>
                )}

                {!loading && filteredVideos.length === 0 && (
                    <p className="text-center text-gray-500 py-24">No videos found.</p>
                )}
            </main>

            <footer id="anchor-footer" className="py-12 text-center text-gray-600 text-sm border-t border-gray-900 mt-20 scroll-mt-20">
                <div className="flex flex-col items-center gap-2">
                    <p>
                        <a
                            href="https://itxdancer.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline-offset-4 hover:underline hover:text-orange-500 transition-all font-medium"
                        >
                            ITxDancer
                        </a>
                        {" by "}
                        <a
                            href="https://itxdancer.com/ken-ono/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline-offset-4 hover:underline hover:text-orange-500 transition-all font-medium"
                        >
                            Ken Ono
                        </a>
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                        <button
                            onClick={handleAdminToggle}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all text-[10px] uppercase tracking-widest ${isAdminMode
                                ? "bg-orange-500 text-white"
                                : "bg-white/5 text-gray-500 hover:text-gray-400 hover:bg-white/10"
                                }`}
                        >
                            {isAdminMode ? <Unlock size={10} /> : <Lock size={10} />}
                            <span>{isAdminMode ? "Admin Active" : "Admin Login"}</span>
                        </button>
                        {isAdminMode && (
                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all text-[10px] uppercase tracking-widest cursor-pointer ${
                                    isSyncing
                                        ? "bg-gray-800 text-gray-500 border border-gray-700/50 cursor-not-allowed"
                                        : "bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30"
                                }`}
                                title="Run GAS automation to import new emails and update metadata"
                            >
                                <span>{isSyncing ? "Syncing..." : "Sync Spreadsheet"}</span>
                            </button>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="hover:text-gray-400 transition-colors cursor-pointer text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100"
                            title="Force Reload"
                        >
                            v5.2 Next.js Edition
                        </button>
                    </div>
                    {syncStatus && (
                        <div className={`mt-3 text-[10px] font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full ${
                            syncStatus.includes("Failed") || syncStatus.includes("Error")
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : syncStatus.includes("Completed")
                                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                    : "bg-orange-500/10 text-orange-400 border border-orange-500/20 animate-pulse"
                        }`}>
                            {syncStatus}
                        </div>
                    )}
                </div>
            </footer>

            {editingVideo && (
                <EditVideoModal
                    video={editingVideo}
                    onClose={() => setEditingVideo(null)}
                    onSave={handleSaveVideo}
                    gasApiUrl={GAS_API_URL}
                />
            )}
        </div>
    );
}
