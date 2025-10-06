import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { Dropdown, Badge } from 'react-bootstrap';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineCloudSync, AiOutlineSetting, AiOutlineClear
} from 'react-icons/ai'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'
const Popup: React.FC = () => {
    const [count, setCount] = useState({ local: "0", remote: "0" })
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
        let getSetting = async () => {
            let data = await browser.storage.local.get(["localCount", "remoteCount"]);
            setCount({ local: data["localCount"], remote: data["remoteCount"] });
        }
        getSetting();
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
                        <Badge variant="success" title="自动同步已启用 - 每2秒检查一次">
                            <AiOutlineCloudSync /> 自动同步
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


