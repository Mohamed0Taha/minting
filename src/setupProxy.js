const { createProxyMiddleware } = require ("http-proxy-middleware");

module.exports = app => {
  app.use(
    "/find",
    createProxyMiddleware({
      target: "https://mint-tracker.wtf/user/find",
      changeOrigin: true,
    })
  );
  app.use(
    "/new",
    createProxyMiddleware({
      target: "https://mint-tracker.wtf/user/new",
      changeOrigin: true,
    })
  );
};
