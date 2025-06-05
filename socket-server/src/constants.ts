export const cors = {
  // TODO: get allowed origins from env https://github.com/expressjs/cors#configuration-options
  origin: (origin: any, callback: (arg0: null, arg1: boolean) => void) => {
    // Allow all
    callback(null, true);
  },
  credentials: true,
};
