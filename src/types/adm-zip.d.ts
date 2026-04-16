declare module 'adm-zip' {
  class AdmZip {
    constructor();
    addFile(name: string, data: Buffer | string, attrs?: any): void;
    toBuffer(): Buffer;
  }
  export = AdmZip;
}
