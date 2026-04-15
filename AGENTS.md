# AGENTS.md

## Node/NPM Execution with NVM (Mandatory)

This project uses NVM-managed Node.js. Before running any `node`, `npm`, or `npx` command, always load NVM in the same shell session:

```bash
source ~/.nvm/nvm.sh
```

Then run the command, for example:

```bash
source ~/.nvm/nvm.sh && npm install
source ~/.nvm/nvm.sh && npm run build
source ~/.nvm/nvm.sh && node src/index.js
```

If a command is executed in a fresh non-interactive shell, include the `source ~/.nvm/nvm.sh` prefix again.
