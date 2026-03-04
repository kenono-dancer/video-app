"use client";

import Image from "next/image";
import { Edit2 } from "lucide-react";

interface VideoCardProps {
    dancer: string;
    discipline: string;
    imageUrl: string;
    videoUrl: string;
    memo?: string;
    platform?: string;
    onEdit?: () => void;
}

export default function VideoCard({
    dancer,
    discipline,
    imageUrl,
    videoUrl,
    memo,
    platform = "YouTube",
    onEdit,
}: VideoCardProps) {
    const handleEditClick = (e: React.MouseEvent) => {
        if (onEdit) {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
        }
    };
    return (
        <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
        >
            <div className="glass-card rounded-xl overflow-hidden h-full">
                <div className="relative w-full h-48 bg-black">
                    <Image
                        src={imageUrl}
                        alt={dancer}
                        fill
                        className="object-contain transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                    {onEdit && (
                        <button
                            onClick={handleEditClick}
                            className="absolute top-2 right-2 z-20 p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-orange-500 transition-colors shadow-lg"
                            title="Edit"
                        >
                            <Edit2 size={16} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-4">
                    <h3 className="text-white font-semibold text-lg truncate mb-1">
                        {dancer}
                    </h3>

                    {memo && (
                        <p className="text-gray-400 text-sm truncate mb-3">
                            {memo}
                        </p>
                    )}

                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            {discipline}
                        </span>
                        <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase transition-colors group-hover:bg-red-500">
                            {platform}
                        </span>
                    </div>
                </div>
            </div>
        </a>
    );
}
