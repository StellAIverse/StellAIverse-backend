declare module "qrcode" {
  function toDataURL(text: string, options?: object): Promise<string>;
  function toString(text: string, options?: object): Promise<string>;
  function toFile(path: string, text: string, options?: object): Promise<void>;
}
