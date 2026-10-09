// Image imports resolve to the built asset: a URL string under plain Vite, or Next-style image data under vinext.
declare module "*.webp" {
  const image: string | { src: string; width: number; height: number };
  export default image;
}
