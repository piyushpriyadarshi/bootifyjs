import { Middleware } from '../core/middleware';
import { OpenAPISpec } from '../core/openapi';

export const swaggerMiddleware = (spec: OpenAPISpec, options: {
  path?: string;
  title?: string;
} = {}): Middleware => {
  const swaggerPath = options.path || '/api-docs';
  const title = options.title || 'API Documentation';
  
  return async (req, res, next) => {
    const url = req.url || '';
    
    if (url === swaggerPath) {
      // Serve Swagger UI HTML
      const html = generateSwaggerHTML(swaggerPath, title);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }
    
    if (url === `${swaggerPath}/swagger.json`) {
      // Serve OpenAPI spec JSON
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(spec, null, 2));
      return;
    }
    
    await next();
  };
};

function generateSwaggerHTML(swaggerPath: string, title: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '${swaggerPath}/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        validatorUrl: null,
        tryItOutEnabled: true,
        supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
        onComplete: function() {
          console.log('Swagger UI loaded successfully');
        },
        onFailure: function(data) {
          console.error('Failed to load Swagger UI:', data);
        }
      });
    };
  </script>
</body>
</html>
  `;
}