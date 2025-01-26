const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/app.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'src/index.html',
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    proxy: {
      '/proxy': {
        target: 'http://localhost:8080',
        secure: false,
        changeOrigin: true,
        router: (req) => {
          const url = new URL(req.url, 'http://localhost:8080');
          const targetUrl = url.searchParams.get('url');
          if (!targetUrl) {
            throw new Error('Missing url parameter');
          }
          return targetUrl;
        },
        onProxyReq: (proxyReq, req) => {
          const url = new URL(req.url, 'http://localhost:8080');
          const targetUrl = url.searchParams.get('url');
          if (targetUrl) {
            const parsedUrl = new URL(targetUrl);
            proxyReq.path = parsedUrl.pathname + parsedUrl.search;
            proxyReq.setHeader('host', parsedUrl.host);
            proxyReq.setHeader('origin', parsedUrl.origin);
          }
        },
        onProxyRes: (proxyRes) => {
          Object.keys(proxyRes.headers).forEach(key => {
            if (key.toLowerCase().startsWith('x-frame-options') ||
                key.toLowerCase().startsWith('content-security-policy')) {
              delete proxyRes.headers[key];
            }
          });
          
          proxyRes.headers['access-control-allow-origin'] = '*';
          proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
          proxyRes.headers['access-control-allow-headers'] = 'X-Requested-With, content-type, Authorization';
          proxyRes.headers['access-control-max-age'] = '3600';
        }
      }
    },
    compress: true,
    port: 8080,
    hot: true, // Enable hot module replacement
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
      progress: true,
      reconnect: true, // Enable auto reconnection
    },
    devMiddleware: {
      writeToDisk: true, // Write files to disk in dev mode
    },
    watchFiles: ['src/**/*'], // Watch all files in src directory
    liveReload: true,
  },
  // Enable source maps for better debugging
  devtool: 'eval-source-map',
};