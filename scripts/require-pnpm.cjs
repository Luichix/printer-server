if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error('Este proyecto utiliza pnpm. Ejecuta pnpm install.');
  process.exit(1);
}

