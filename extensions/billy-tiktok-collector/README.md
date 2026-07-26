# Billy Creator Collector

Private Chrome extension for Billy's Scraper System.

## Install Locally

1. Open `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:

   `/Users/anhquannguyen/Documents/Katlas productivity/talent-ops-hub/extensions/billy-tiktok-collector`

## Use

1. Open a TikTok hashtag/sound page, Instagram hashtag/search/audio page, or YouTube search/hashtag/channel page.
2. Click the Billy Creator Collector extension.
3. Click `Begin Scraping Session`.
4. Scroll the source grid. The extension keeps adding newly loaded posts and dedupes creators.
5. Click the extension again.
6. Click `Finish & Send To Billy`.

The source tab stays open. Billy sends the creator session to the app in the background and shows a short transfer notice on the source page.

TikTok is the verified scraper path. Instagram and YouTube use best-effort browser collection only. They can collect visible post/video links and creators when the page or fetched post data exposes the creator, but they are not as reliable as TikTok and they do not use official Instagram or YouTube APIs.

## Supported Instagram Hashtag Links

Billy accepts these Instagram hashtag/search shapes:

- `https://www.instagram.com/explore/tags/streetphotography/`
- `https://www.instagram.com/explore/search/keyword/?q=%23streetphotography`
- `https://www.instagram.com/explore/search/keyword/?q=streetphotography`
- `https://www.instagram.com/explore/search/keyword?q=%23streetphotography`
- `https://www.instagram.com/explore/search/keyword/?query=%23streetphotography`
- `https://www.instagram.com/explore/search/keyword/?keyword=streetphotography`
- `https://www.instagram.com/explore/search/tag/?q=%23streetphotography`
- `https://www.instagram.com/explore/search/tags/?q=%23streetphotography`
- `https://www.instagram.com/explore/search/hashtag/?q=%23streetphotography`
- `https://www.instagram.com/explore/search/hashtags/?q=%23streetphotography`
