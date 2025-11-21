import OptionsSync from 'webext-options-sync';
/* global OptionsSync */

export default new OptionsSync({
    defaults: {
        githubToken: '',
        gistID: '',
        gistFileName: 'BookmarkHub',
        enableNotify: true as boolean,

        githubURL: 'https://api.github.com',
        // Auto sync configuration
        autoSyncEnabled: false as boolean,

        autoSyncInterval: 15,
        lastSyncTime: 0,
        // Encryption configuration
        enableEncrypt: false as boolean,

        encryptPassword: '',
    },

    // List of functions that are called when the extension is updated
    migrations: [
        (savedOptions, currentDefaults) => {
            // Perhaps it was renamed
            // if (savedOptions.colour) {
            //     savedOptions.color = savedOptions.colour;
            //delete savedOptions.colour;
            // }
        },

        // Integrated utility that drops any properties that don't appear in the defaults
        OptionsSync.migrations.removeUnused
    ],
    logging: false
});