CREATE DATABASE IF NOT EXISTS bingo_humano
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'bingo_user'@'localhost'
  IDENTIFIED BY 'bingo_password';

CREATE USER IF NOT EXISTS 'bingo_user'@'127.0.0.1'
  IDENTIFIED BY 'bingo_password';

GRANT ALL PRIVILEGES ON bingo_humano.* TO 'bingo_user'@'localhost';
GRANT ALL PRIVILEGES ON bingo_humano.* TO 'bingo_user'@'127.0.0.1';

FLUSH PRIVILEGES;
