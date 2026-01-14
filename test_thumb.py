import re

def get_thumbnail_url(video_url):
    # Current Regex
    regex = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(regex, video_url)
    if match:
        video_id = match.group(1)
        return f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    return "NO_MATCH"

urls = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ", # This might fail with current regex if v= is not first relevant char? 
    # Actually re.search finds anywhere.
]

for u in urls:
    print(f"{u} -> {get_thumbnail_url(u)}")
