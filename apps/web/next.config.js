/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit reads its Helvetica .afm metrics off disk at runtime, and pdfjs
  // (under pdf-parse) ships worker/standard-font assets. Bundling either one
  // breaks those file reads, so leave them as real node_modules on the server.
  serverExternalPackages: ['pdfkit', 'pdf-parse', 'mammoth'],

  // Those same data files are loaded via paths the tracer cannot follow
  // statically, so name them explicitly — otherwise they get pruned from the
  // serverless bundle and the routes 500 in production only.
  outputFileTracingIncludes: {
    '/api/resume/generate': ['../../node_modules/pdfkit/js/data/**'],
    '/api/resume/parse': ['../../node_modules/pdfjs-dist/standard_fonts/**'],
  },
};

export default nextConfig;
