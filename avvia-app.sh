#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
	NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
	if [[ -s "$NVM_DIR/nvm.sh" ]]; then
		. "$NVM_DIR/nvm.sh"
		nvm use --silent default >/dev/null 2>&1 || true
	fi
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
	echo "Node.js e npm non trovati. Installa Node.js 18 o superiore da https://nodejs.org."
	exit 1
fi

if [[ ! -d node_modules ]]; then
	echo "Prima esecuzione: installazione dipendenze..."
	npm install
fi

case "${1:-avvia}" in
	avvia|start)
		echo "Avvio FinRet su http://localhost:5173"
		npm run dev -- --open
		;;
	test|tests)
		npm test
		;;
	build)
		npm run build
		;;
	*)
		echo "Uso: $0 [avvia|test|build]"
		exit 2
		;;
esac
