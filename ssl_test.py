
import ssl
import urllib.request
import sys

# Apply the fix
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

url = "https://docs.google.com/spreadsheets/d/1szdhHLrIHF_uMDjIOJokPGsxm_7BbvhiT9iKxrYxtH8/edit?usp=drive_link"

print(f"Attempting to connect to {url}...")
try:
    resp = urllib.request.urlopen(url)
    print(f"Success! Status: {resp.status}")
except Exception as e:
    print(f"Failed: {e}")
    sys.exit(1)
