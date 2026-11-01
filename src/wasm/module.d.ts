declare module '*generated/haar/haar.js' {
  const create: (options: { locateFile: (path:string)=>string }) => Promise<import('./session').Module>;
  export default create;
}
