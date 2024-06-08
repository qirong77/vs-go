import { getVsCodeOpenedFolder } from "../main/utils/getVsCodeOpenedFolder"

describe('测试VsCode文件',()=>{
    const value = getVsCodeOpenedFolder()
    expect(value).toBeTruthy()
})