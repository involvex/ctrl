import { startServer } from './server';

const { shutdown } = await startServer();

const onSignal = (signal: string) => {
  void shutdown(signal);
};

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));
process.on('SIGBREAK', () => onSignal('SIGBREAK'));
process.on('SIGHUP', () => onSignal('SIGHUP'));
