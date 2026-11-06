# Long Light

A quiet place to fish, by yourself or with friends. Walk to the jetty at sunset, row out, cast, have a beer, and watch the sky go dark.

**Play:** https://pollie80.github.io/long-light/ in Chrome or Edge on a computer.

## Playing with friends

Open the menu, choose **Friends**, then **Create invite link**, and send the link. Up to 8 people share one cove and one sky. There are no accounts and no game server. A public service introduces the browsers to each other, and then they connect directly.

- Friends leave when the person who made the link closes the game.
- Connected browsers can see each other's IP addresses, so invite people you know.
- A strict network can block the connection. If that happens, the game says so and offers to play alone.

## Building

```bash
npm install
npm run dev
npm run build
```

`npm run build` makes one self-contained file, `dist/index.html`. `npm run deploy` builds and publishes it to GitHub Pages.

Three.js with custom GLSL shaders, TypeScript and Vite. All the art is made in code. See [docs/design.md](docs/design.md).
