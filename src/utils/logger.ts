import log4js from 'log4js';

log4js.configure({
  appenders: {
    console: { type: 'console' },
  },
  categories: {
    default: {
      appenders: ['console'],
      level: 'debug',
    },
  },
});

const logger = log4js.getLogger('default');
const { getLogger } = log4js;

export { getLogger };
export default logger;
