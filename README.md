<p align="center">
  <img src="frontend/public/favicon.svg" width="72" alt="" />
</p>

<h1 align="center">tapeshelf</h1>

<p align="center">Your private video shelf. Keep your videos in one place and share them with exactly the people you choose.</p>

tapeshelf is a place for videos you don't want on the public internet. Everything you upload stays private until you decide otherwise. You can send someone a link that stops working when you say so, trade videos with friends one for one, or keep the whole shelf to yourself. Search engines don't see it, and there's no feed and no ads.

This repository is the whole app. It runs on your machine, and the videos stay on your disk. The only limits are the ones you set.

Don't want to run a server? There's a hosted version at [tapeshelf.com](https://tapeshelf.com).

## Install it

Open a terminal, paste this line and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/tapeshelf/tapeshelf/main/install.sh | bash
```

A terminal is the window where you type commands: Terminal on a Mac, Ctrl+Alt+T on Ubuntu. On Windows, [install WSL](https://learn.microsoft.com/windows/wsl/install) first and paste the line there. If Ubuntu says it doesn't know `curl`, run `sudo apt install curl` first.

The script asks a couple of questions and does the rest. It installs Docker if you don't have it, creates passwords and encryption keys, downloads tapeshelf and starts it. When it finishes, it shows you the address and your admin login. You don't need to write code or edit files.

It will ask you to pick one of two things:

- **Just this computer.** You try it at an address like `http://localhost:8080`. Nobody else can reach it, and you don't need a domain.
- **On the internet.** For this you need a server and a domain name. A server here means a VPS: a small computer you rent online by the month. Any provider works, with 2 GB of memory or more and enough disk for your videos. Connect to it with `ssh root@YOUR-SERVER-IP` (your provider sends you these details), then paste the line above. The script tells you exactly what to change at the company where you bought your domain, and sets up the HTTPS certificate by itself.

If anything goes wrong halfway, run the same line again. It picks up where it stopped and nothing is lost.

**On the internet, sign-ups start closed**, so strangers can't fill your disk. When you want people in, turn them on under Admin → Settings, and set limits there too. Once open, anyone who finds your address can create an account and upload.

## Everyday use

The installer puts everything into a `tapeshelf` folder in your home directory. Go there with `cd ~/tapeshelf`, and then:

| Command                         | What it does                                                      |
| ------------------------------- | ----------------------------------------------------------------- |
| `./tapeshelf.sh status`         | Shows whether everything is running                               |
| `./tapeshelf.sh update`         | Saves the database, then installs the newest version              |
| `./tapeshelf.sh backup`         | Saves the database, settings and built-in storage into `backups/` |
| `./tapeshelf.sh restore FILE`   | Puts a backup back                                                |
| `./tapeshelf.sh stop` / `start` | Stops and starts it; nothing is deleted                           |
| `./tapeshelf.sh logs`           | Shows what it's doing right now                                   |
| `./tapeshelf.sh admin-password` | Sets a new admin password                                         |

**Keep a copy of the `.env` file somewhere safe, away from this machine.** It holds the key that encrypts your videos. If you lose it, nobody can ever play them again, including you. `./tapeshelf.sh backup` includes it, and that makes the backup file itself something to guard.

## What it does

Your shelf is arranged the way you like: categories, stacks, your own order and covers, and anything you want hidden stays hidden.

Links can last an hour, a day or a week, for one person or for anyone who has the link, and you can revoke them at any time. You can also ask for someone's private video and offer one of yours. Neither side gets anything until both agree.

There are friends, messages and notifications, with blocking when you need it, and a video editor in the browser for trimming, cropping, blurring and captions. Admins get a panel with users, reports, support tickets, a trash they can restore from and an audit log. The whole thing speaks 20 languages.

Videos play from encrypted segments, and the player never gets a link to the file. Hidden data like location and camera model is removed from the file on upload, though your instance's admin can still see what it was.

## Good to know

**Email is optional.** Without an email account, sign-ups work straight away, but nobody can reset a forgotten password or get email notifications. To add one later, open the settings with `nano .env`, then set `EMAIL_DISABLED=false`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`, save, and run `./tapeshelf.sh restart`. Use `SMTP_SECURE=true` with port 465.

**Your own proxy.** If nginx or Traefik already uses ports 80 and 443 on your server, the installer notices and offers to go behind it, and shows you what to add to your proxy's settings. You can also ask for it directly: `bash install.sh --behind-proxy video.example.com`.

**Your own storage.** Videos live on the server's disk by default. To use S3-compatible storage instead (Backblaze, Wasabi, AWS and so on), add these to `.env` and run `./tapeshelf.sh restart`, ideally before uploading anything, since existing videos don't move by themselves:

```bash
S3_ENDPOINT=https://s3.your-provider.com
S3_REGION=your-region
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET_PRIVATE=your-private-bucket
S3_BUCKET_PUBLIC=your-public-bucket
S3_PUBLIC_ENDPOINT=https://s3.your-provider.com
S3_FORCE_PATH_STYLE=false
S3_PUBLIC_BUCKET_URL=https://your-public-bucket.s3.your-provider.com
CSP_S3_ORIGINS=https://s3.your-provider.com https://your-public-bucket.s3.your-provider.com https://your-private-bucket.s3.your-provider.com
STORAGE_UPSTREAM=
```

Your storage has to allow your site's address in its CORS settings. `./tapeshelf.sh backup` doesn't copy videos kept there.

**Something went wrong?** `./tapeshelf.sh status` and `./tapeshelf.sh logs` usually say why. If not, [open an issue](https://github.com/tapeshelf/tapeshelf/issues) with what you see there.

## For developers

You need Node 22, npm 12, Docker and ffmpeg.

```bash
git clone https://github.com/tapeshelf/tapeshelf.git
cd tapeshelf
cp backend/.env.example backend/.env
./dev.sh --init
```

That starts the database and storage in Docker, the API and worker, and the web app at <http://localhost:4200>. The backend is NestJS with Prisma and BullMQ, the frontend is Angular. More in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0](LICENSE). You can use, change and host it freely. If you run a changed version for other people, you have to share your changes with them. The name and logo are covered separately, see [TRADEMARK.md](TRADEMARK.md).
