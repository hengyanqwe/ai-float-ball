declare module '*.less' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css' {
  const css: string;
  export default css;
} 