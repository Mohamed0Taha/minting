const { createProxyMiddleware } = require ("http-proxy-middleware");

module.exports = app => {
  app.use(
    "/user/find",
    createProxyMiddleware({
      target: "http://mint-tracker.wtf/user/find",
      changeOrigin: true,
    })
  );
  app.use(
    "/user/new",
    createProxyMiddleware({
      target: "http://mint-tracker.wtf/user/new",
      changeOrigin: true,
    })
  );
};
