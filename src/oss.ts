import OSS from 'ali-oss'
import { oss_config } from './config'

let client = new OSS(oss_config);

async function get_file_content (file_name: string): Promise<string> {
  try {
    let result = await client.get(file_name);
    return result.content.toString();
  } catch (e) {
    console.log(e);
    return '';
  }
}

async function put_file (file_name: string, content: string) {
  try {
    let result = await client.put(file_name, Buffer.from(content));
    return result;
  } catch (e) {
    console.log(e);
    return;
  }
}

export {
  get_file_content,
  put_file
}