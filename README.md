# Long Light

A quiet place to fish, by yourself or with friends. Walk to the jetty at sunset, row out, cast, have a beer, and watch the sky go dark. Choose between a green cove, a Philippine lagoon and a Canadian lake, bring a pet, deck out your boat, and take a shotgun to the passing ducks if the fish aren't biting.

**Play:** https://pollie80.github.io/long-light/ in Chrome or Edge on a computer.

## Playing with friends

Open the menu, choose **Friends**, then **Create invite link**, and send the link. Up to 8 people share one place and one sky. There are no accounts and no game server. A public service introduces the browsers to each other, and then they connect directly.

- Friends leave when the person who made the link closes the game.
- Connected browsers can see each other's IP addresses, so invite people you know.
- If two players can't connect directly, the game switches to a backup route through a public message service. Everything on that route is encrypted with a key from the invite code. If that fails too, the game says so and offers to play alone.

## Building

```bash
npm install
npm run dev
npm run build
```

`npm run build` makes one self-contained file, `dist/index.html`. `npm run deploy` builds and publishes it to GitHub Pages. `npm run desktop` builds the Windows desktop folder for Steam.

Three.js with custom GLSL shaders, TypeScript and Vite. All the art is made in code. See [docs/design.md](docs/design.md).
