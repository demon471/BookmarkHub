import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { Dropdown, Badge } from 'react-bootstrap';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting, AiOutlineClear
} from 'react-icons/ai'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'
const Popup: React.FC = () => {
    const [count, setCount] = useState({ local: "0", remote: "0", excluded: "0" })
    useEffect(() => {
        document.addEventListener('click', (e: MouseEvent) => {
            let elem = e.target as HTMLInputElement;
            if (elem != null && elem.className === 'dropdown-item') {
                elem.setAttribute('disabled', 'disabled');
                browser.runtime.sendMessage({ name: elem.name })
                    .then((res) => {
                        elem.removeAttribute('disabled');
                        console.log("msg", Date.now())
                    })
                    .catch(c => {
                        console.log("error", c)
                    });
            }
        });
    }, [])
    useEffect(() => {
        const getSetting = async () => {
            const data = await browser.storage.local.get(["localCount", "remoteCount"]);
            const localNum = Number(data["localCount"] ?? 0);
            const remoteNum = Number(data["remoteCount"] ?? 0);
            const excludedNum = Math.max(localNum - remoteNum, 0);
            setCount({
                local: String(localNum),
                remote: String(remoteNum),
                excluded: String(excludedNum),
            });
        };

        getSetting();

        const handleChange = (changes: any, areaName: string) => {
            if (areaName === 'local' && (changes.localCount || changes.remoteCount)) {
                getSetting();
            }
        };

        browser.storage.onChanged.addListener(handleChange);
        return () => {
            browser.storage.onChanged.removeListener(handleChange);
        };
    }, [])
    return (
        <IconContext.Provider value={{ className: 'dropdown-item-icon' }}>
            <Dropdown.Menu show>
                <Dropdown.Item name='upload' as="button" title={browser.i18n.getMessage('uploadBookmarksDesc')}><AiOutlineCloudUpload />{browser.i18n.getMessage('uploadBookmarks')}</Dropdown.Item>
                <Dropdown.Item name='download' as="button" title={browser.i18n.getMessage('downloadBookmarksDesc')}><AiOutlineCloudDownload />{browser.i18n.getMessage('downloadBookmarks')}</Dropdown.Item>
                <Dropdown.Item 
                    name='removeAll' 
                    as="button" 
                    title={browser.i18n.getMessage('removeAllBookmarksDesc')}
                    style={{ color: '#dc3545' }}
                >
                    <AiOutlineClear />{browser.i18n.getMessage('removeAllBookmarks')}
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item name='setting' as="button"><AiOutlineSetting />{browser.i18n.getMessage('settings')}</Dropdown.Item>
                <Dropdown.ItemText>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Badge id="localCount" variant="light" title={browser.i18n.getMessage('localCount')}>{count["local"]}</Badge>
                            <span style={{ fontSize: '12px', color: '#666' }}>本地</span>
                        </div>
                        <span style={{ color: '#ccc' }}>/</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Badge id="remoteCount" variant="light" title={browser.i18n.getMessage('remoteCount')}>{count["remote"]}</Badge>
                            <span style={{ fontSize: '12px', color: '#666' }}>远程</span>
                        </div>
                        <Badge variant="secondary" title="被过滤掉、不参与同步的本地书签数量">
                            排除 {count["excluded"]}
                        </Badge>
                    </div>
                </Dropdown.ItemText>
            </Dropdown.Menu >
        </IconContext.Provider>
    )
}


ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
);


