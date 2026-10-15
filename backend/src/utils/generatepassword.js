import bcrypt from "bcryptjs";

const generatePassword = async (password)=>{
    const hashedPassword = await bcrypt.hash(password, 12);
    console.log(`generated password: ${hashedPassword}`);
}

generatePassword("adminpassword45");
