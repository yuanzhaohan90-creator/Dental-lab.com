# YZH Dental Lab DNS and Launch Checklist

Current verified state on August 12, 2026:

- Latest site code is pushed to GitHub commit `6bbf80d27db7442a63cb70482d69daa6ff3161c0`.
- GitHub Pages preview is live at `https://yuanzhaohan90-creator.github.io/Dental-lab.com/`.
- `https://yzhdentallab.com/` currently has SSL/certificate problems and does not serve the new site.
- `http://yzhdentallab.com/` currently redirects through Namecheap URL Forward to `http://www.yzhdentallab.com/`.
- `http://www.yzhdentallab.com/` currently serves an old 2963-byte page with an empty title.
- Root and www DNS records currently point to different IPs, so www/non-www are not canonicalized.

Recommended production setup if using Vercel for the case submission API:

1. In Vercel, connect GitHub repo `yuanzhaohan90-creator/Dental-lab.com`.
2. Set production branch to `main`.
3. Add both domains in Vercel:
   - `yzhdentallab.com`
   - `www.yzhdentallab.com`
4. In Namecheap DNS, remove URL Forwarding and old A records for root and www.
5. Set DNS records:
   - `A` record: host `@`, value `76.76.21.21`
   - `CNAME` record: host `www`, value `cname.vercel-dns.com`
6. In Vercel, set `yzhdentallab.com` as the primary domain.
7. Enable redirect from `www.yzhdentallab.com` to `yzhdentallab.com`.
8. Wait for Vercel SSL certificate status to become active.
9. Re-test:
   - `https://yzhdentallab.com/`
   - `https://www.yzhdentallab.com/`
   - `http://yzhdentallab.com/`
   - `http://www.yzhdentallab.com/`
   - `/robots.txt`
   - `/sitemap.xml`
   - `/api/submit-case`

Alternative static-only setup if using GitHub Pages:

1. Add custom domain `yzhdentallab.com` in GitHub Pages settings.
2. Add a repository `CNAME` file containing `yzhdentallab.com`.
3. Set Namecheap DNS records:
   - `A` `@` `185.199.108.153`
   - `A` `@` `185.199.109.153`
   - `A` `@` `185.199.110.153`
   - `A` `@` `185.199.111.153`
   - `CNAME` `www` `yuanzhaohan90-creator.github.io`
4. Enable Enforce HTTPS in GitHub Pages.

Important: GitHub Pages will serve the static site, but it will not run `/api/submit-case`. Use Vercel or another backend-capable host for secure case submission and file upload.
