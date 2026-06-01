declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
  export = classes
}

declare module '*.module.scss' {
  const classes: Record<string, string>
  export default classes
  export = classes
}
