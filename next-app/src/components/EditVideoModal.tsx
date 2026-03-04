"use client";

import { useState, useRef } from "react";
import { X, Save, AlertCircle, Upload, Image as ImageIcon } from "lucide-react";

interface Video {
    id: number;
    dancer: string;
    discipline: string;
    videoUrl: string;
    imageUrl: string;
    date: string;
    memo?: string;
    platform?: string;
}

interface EditVideoModalProps {
    video: Video;
    onClose: () => void;
    onSave: (updatedVideo: Video) => void;
    gasApiUrl: string;
}

export default function EditVideoModal({ video, onClose, onSave, gasApiUrl }: EditVideoModalProps) {
    const [dancer, setDancer] = useState(video.dancer);
    const [discipline, setDiscipline] = useState(video.discipline);
    const [memo, setMemo] = useState(video.memo || "");
    const [newImage, setNewImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setNewImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);

        try {
            let currentImageUrl = video.imageUrl;

            // 1. If new image selected, upload to Drive first
            if (newImage) {
                const base64 = await toBase64(newImage);
                const uploadParams = new URLSearchParams({
                    file_content: base64,
                    mimeType: newImage.type,
                    filename: newImage.name
                });

                const uploadResp = await fetch(gasApiUrl, {
                    method: "POST",
                    body: uploadParams
                });
                const uploadResult = await uploadResp.json();

                if (uploadResult.success) {
                    currentImageUrl = uploadResult.url;
                } else {
                    throw new Error(uploadResult.error || "Image upload failed");
                }
            }

            // 2. Update metadata
            const thumbnailFormula = `=HYPERLINK("${video.videoUrl}", IMAGE("${currentImageUrl}", 1))`;

            const params = new URLSearchParams({
                action: "edit",
                id: video.id.toString(),
                dancer,
                discipline,
                memo,
                date: video.date,
                thumbnail: thumbnailFormula,
                platform: video.platform || "YouTube",
                videoUrl: video.videoUrl,
                imageUrl: currentImageUrl
            });

            // Using body instead of URL params for the second POST as well
            const response = await fetch(gasApiUrl, {
                method: "POST",
                body: params
            });

            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                onSave({
                    ...video,
                    dancer,
                    discipline,
                    memo,
                    imageUrl: currentImageUrl
                });
                onClose();
            } else {
                throw new Error(result.error || "Failed to update video (Server Error)");
            }
        } catch (err: any) {
            console.error("Save error:", err);
            // Provide more detail for "Failed to fetch" which is often a CORS or Network issue
            const errorMsg = err.message === "Failed to fetch"
                ? "Network error or API access blocked. Please check your connection."
                : (err.message || "Something went wrong while saving");
            setError(errorMsg);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="flex justify-between items-center p-6 border-b border-white/5">
                    <h2 className="text-xl font-bold text-white">Edit Video Metadata</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Image Upload/Preview */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Thumbnail Image</label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="relative aspect-video rounded-xl bg-black/40 border-2 border-dashed border-white/10 hover:border-orange-500/50 transition-all cursor-pointer group overflow-hidden"
                        >
                            {imagePreview || video.imageUrl ? (
                                <img
                                    src={imagePreview || video.imageUrl}
                                    alt="Preview"
                                    className="w-full h-full object-contain"
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-2">
                                    <ImageIcon size={32} />
                                    <span className="text-xs">Click to browse</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Upload className="text-white" size={24} />
                            </div>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/*"
                            className="hidden"
                        />
                        <p className="text-[10px] text-gray-500 italic">Recommended: 16:9 aspect ratio</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dancer Name</label>
                        <input
                            type="text"
                            value={dancer}
                            onChange={(e) => setDancer(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition-colors"
                            placeholder="e.g. Ken Ono"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Discipline</label>
                        <input
                            type="text"
                            value={discipline}
                            onChange={(e) => setDiscipline(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition-colors"
                            placeholder="e.g. Waltz"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Memo</label>
                        <textarea
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-orange-500 transition-colors h-24 resize-none"
                            placeholder="Add notes..."
                        />
                    </div>

                    <div className="pt-4 flex gap-3 sticky bottom-0 bg-background/80 backdrop-blur-md pb-2 mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl bg-white/5 text-white font-semibold hover:bg-white/10 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isSaving ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div>
                            ) : (
                                <>
                                    <Save size={18} />
                                    <span>Save Changes</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
