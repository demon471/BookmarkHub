import { Options } from 'webext-options-sync';
import optionsStorage from './optionsStorage'
export class SettingBase implements Options {
    constructor() { }
    [key: string]: string | number | boolean;
    githubToken: string = '';
    gistID: string = '';
    gistFileName: string = 'BookmarkHub';
    enableNotify: boolean = true;
    githubURL: string = 'https://api.github.com';
    // Auto sync configuration
    autoSyncEnabled: boolean = false;
    autoSyncInterval: number = 5; // minutes
    lastSyncTime: number = 0; // timestamp
    // Encryption configuration
    enableEncrypt: boolean = false;
    encryptPassword: string = '';
}
export class Setting extends SettingBase {
    private constructor() { super() }
    static async build() {
        let options = await optionsStorage.getAll();
        let setting = new Setting();
        setting.gistID = options.gistID;
        setting.gistFileName = options.gistFileName;
        setting.githubToken = options.githubToken;
        setting.enableNotify = options.enableNotify;
        // Auto sync configuration mapping
        setting.autoSyncEnabled = options.autoSyncEnabled || false;
        setting.autoSyncInterval = options.autoSyncInterval || 5;
        setting.lastSyncTime = options.lastSyncTime || 0;
        // Encryption configuration mapping
        setting.enableEncrypt = options.enableEncrypt || false;
        setting.encryptPassword = options.encryptPassword || '';
        return setting;
    }
}




// export class SettingBase {
//     constructor() { }
//     [key: string]: string | number | boolean;
//     githubToken: string = '';
//     gistID: string = '';
//     gistFileName: string = 'BookmarkHub';
//     enableNotify: boolean = true;
//     githubURL: string = 'https://api.github.com';
// }
// export class Setting extends SettingBase {
//     private constructor() { super() }
//     static async build() {
//         let options =new Setting();
//         let setting = new Setting();
//         setting.gistID = options.gistID;
//         setting.gistFileName = options.gistFileName;
//         setting.githubToken = options.githubToken;
//         setting.enableNotify = options.enableNotify;
//         return setting;
//     }
// }
