import { showToast } from "../utils/toast";

export function autoLogin() {
  if (
    window.origin.includes(
      "m@e-a@u@t@@@@@h.i@n@@@t@r@@@@@a.x@@@i@@@@@a@@o@j@u@k@e@j@i.c@o@m@".replaceAll("@", "")
    )
  ) {
    showToast({ message: "检测到登录页面，正在自动填写登录信息...", type: "info" });
    const user = document.querySelector("#username") as HTMLInputElement;
    const password = document.querySelector("#password") as HTMLInputElement;
    user.value = import.meta.env.PRELOAD_VITE_USER_NAME;
    password.value = import.meta.env.PRELOAD_VITE_PASS_WORD;
    const loginBtn = document.querySelector("#submit") as HTMLButtonElement;
    loginBtn.click();
  }
}
