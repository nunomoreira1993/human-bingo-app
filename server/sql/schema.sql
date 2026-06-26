CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(191) NOT NULL,
  password_reset_required BOOLEAN NOT NULL DEFAULT TRUE,
  role ENUM('player', 'admin') NOT NULL DEFAULT 'player',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE games (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL DEFAULT 'Bingo Humano',
  status ENUM('draft', 'open', 'closed') NOT NULL DEFAULT 'draft',
  closes_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE facts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  text TEXT NOT NULL,
  correct_person_id INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX facts_correct_person_id_idx (correct_person_id),
  CONSTRAINT facts_correct_person_id_fkey FOREIGN KEY (correct_person_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE guesses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  player_id INT NOT NULL,
  fact_id INT NOT NULL,
  selected_person_id INT NOT NULL,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY unique_player_fact (player_id, fact_id),
  INDEX guesses_fact_id_idx (fact_id),
  INDEX guesses_selected_person_id_idx (selected_person_id),
  CONSTRAINT guesses_player_id_fkey FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT guesses_fact_id_fkey FOREIGN KEY (fact_id) REFERENCES facts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT guesses_selected_person_id_fkey FOREIGN KEY (selected_person_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
