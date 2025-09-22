import { Setting } from './setting'
import { http } from './http'
class BookmarkService {
    async get() {
        let setting = await Setting.build();
        let resp = await http.get(`gists/${setting.gistID}`).json() as any
        if (resp?.files) {
            let filenames = Object.keys(resp.files);
            if (filenames.indexOf(setting.gistFileName) !== -1) {
                let gistFile = resp.files[setting.gistFileName]
                if (gistFile.truncated) {
                    const txt = http.get(gistFile.raw_url, {prefixUrl: ''}).text();
                    return txt;
                } else {
                    return gistFile.content
                }
            }
        }
        return null;
    }
    async getAllGist() {
        return http.get('gists').json();
    }
    async update(data: any) {
        let setting = await Setting.build();
        console.log('BookmarkService.update called with:', {
            gistID: setting.gistID,
            dataKeys: Object.keys(data),
            filesKeys: Object.keys(data.files || {}),
            dataSize: JSON.stringify(data).length
        });
        
        const result = await http.patch(`gists/${setting.gistID}`, { json: data }).json();
        console.log('BookmarkService.update result:', result);
        return result;
    }
}

export default new BookmarkService()