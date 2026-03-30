/**
 * Smart Data Generator - Интеллектуальная генерация тестовых данных
 * v0.9.4.9
 */

(function() {
  'use strict';

  /**
   * Генераторы данных по контексту
   */
  const DataGenerators = {
    
    // Русские имена
    russianNames: {
      first: {
        male: ['Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Алексей', 'Артём', 'Илья', 'Кирилл', 'Михаил', 'Никита', 'Матвей', 'Роман', 'Егор', 'Арсений', 'Иван', 'Денис', 'Евгений', 'Даниил', 'Тимофей'],
        female: ['Анна', 'Мария', 'Елена', 'Ольга', 'Ирина', 'Екатерина', 'Наталья', 'Татьяна', 'Юлия', 'Светлана', 'Анастасия', 'Дарья', 'Виктория', 'Полина', 'Алина', 'Ксения', 'Валерия', 'София', 'Варвара', 'Вероника']
      },
      last: ['Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов', 'Михайлов', 'Новиков', 'Фёдоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев', 'Семёнов', 'Егоров', 'Павлов', 'Козлов', 'Степанов', 'Николаев'],
      patronymic: {
        male: ['Александрович', 'Дмитриевич', 'Максимович', 'Сергеевич', 'Андреевич', 'Алексеевич', 'Артёмович', 'Ильич', 'Кириллович', 'Михайлович'],
        female: ['Александровна', 'Дмитриевна', 'Максимовна', 'Сергеевна', 'Андреевна', 'Алексеевна', 'Артёмовна', 'Ильинична', 'Кирилловна', 'Михайловна']
      }
    },

    // Английские имена
    englishNames: {
      first: {
        male: ['John', 'James', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles'],
        female: ['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen']
      },
      last: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez']
    },

    // Email домены
    emailDomains: ['gmail.com', 'yandex.ru', 'mail.ru', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'],

    // Города
    cities: {
      ru: ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону'],
      en: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose']
    },

    // Улицы
    streets: {
      ru: ['Ленина', 'Советская', 'Центральная', 'Молодёжная', 'Набережная', 'Лесная', 'Садовая', 'Новая', 'Школьная', 'Зелёная'],
      en: ['Main St', 'Oak St', 'Maple Ave', 'Cedar Ln', 'Elm St', 'Park Ave', 'Washington St', 'Lake St', 'Hill St', 'Church St']
    },

    /**
     * Генерация русского имени
     */
    generateRussianName(gender = null) {
      const g = gender || (Math.random() > 0.5 ? 'male' : 'female');
      const first = this.randomFrom(this.russianNames.first[g]);
      const last = this.russianNames.last[Math.floor(Math.random() * this.russianNames.last.length)];
      const lastFeminine = g === 'female' ? last + 'а' : last;
      return { first, last: lastFeminine, full: `${first} ${lastFeminine}` };
    },

    /**
     * Генерация русского ФИО
     */
    generateRussianFullName(gender = null) {
      const g = gender || (Math.random() > 0.5 ? 'male' : 'female');
      const first = this.randomFrom(this.russianNames.first[g]);
      const last = this.russianNames.last[Math.floor(Math.random() * this.russianNames.last.length)];
      const lastFeminine = g === 'female' ? last + 'а' : last;
      const patronymic = this.randomFrom(this.russianNames.patronymic[g]);
      return {
        first, last: lastFeminine, patronymic,
        full: `${last Feminine} ${first} ${patronymic}`
      };
    },

    /**
     * Генерация английского имени
     */
    generateEnglishName(gender = null) {
      const g = gender || (Math.random() > 0.5 ? 'male' : 'female');
      const first = this.randomFrom(this.englishNames.first[g]);
      const last = this.randomFrom(this.englishNames.last);
      return { first, last, full: `${first} ${last}` };
    },

    /**
     * Генерация реалистичного email
     */
    generateRealisticEmail(name = null, domain = null) {
      const useName = name || this.generateEnglishName();
      const firstName = (useName.first || useName).toLowerCase().replace(/[^a-z]/g, '');
      const lastName = (useName.last || '').toLowerCase().replace(/[^a-z]/g, '');
      const domainName = domain || this.randomFrom(this.emailDomains);
      
      const patterns = [
        `${firstName}.${lastName}@${domainName}`,
        `${firstName}${lastName}@${domainName}`,
        `${firstName}_${lastName}@${domainName}`,
        `${firstName}${Math.floor(Math.random() * 100)}@${domainName}`,
        `${firstName.substring(0, 1)}${lastName}@${domainName}`
      ];
      
      return this.randomFrom(patterns);
    },

    /**
     * Генерация телефона по стране
     */
    generatePhoneByCountry(country = 'RU') {
      const patterns = {
        'RU': () => {
          const codes = ['903', '905', '906', '909', '910', '915', '916', '917', '926', '927', '985', '999'];
          const code = this.randomFrom(codes);
          return `+7 (${code}) ${this.randomDigits(3)}-${this.randomDigits(2)}-${this.randomDigits(2)}`;
        },
        'US': () => {
          const area = this.randomDigits(3);
          return `+1 (${area}) ${this.randomDigits(3)}-${this.randomDigits(4)}`;
        },
        'UK': () => {
          return `+44 ${this.randomDigits(4)} ${this.randomDigits(6)}`;
        }
      };
      
      return (patterns[country] || patterns['RU'])();
    },

    /**
     * Генерация даты рождения
     */
    generateRealisticBirthDate(minAge = 18, maxAge = 80) {
      const now = new Date();
      const minDate = new Date(now.getFullYear() - maxAge, 0, 1);
      const maxDate = new Date(now.getFullYear() - minAge, 11, 31);
      const randomTime = minDate.getTime() + Math.random() * (maxDate.getTime() - minDate.getTime());
      const date = new Date(randomTime);
      return date.toISOString().split('T')[0];
    },

    /**
     * Генерация кредитной карты (тестовые номера)
     */
    generateCreditCard(type = 'visa') {
      const patterns = {
        visa: '4532############',
        mastercard: '5425############',
        amex: '3782###########',
        mir: '2200############'
      };
      
      let pattern = patterns[type] || patterns.visa;
      return pattern.replace(/#/g, () => Math.floor(Math.random() * 10));
    },

    /**
     * Генерация почтового индекса
     */
    generateZipCode(country = 'RU') {
      const patterns = {
        'RU': () => this.randomDigits(6),
        'US': () => this.randomDigits(5),
        'UK': () => {
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          return `${this.randomFrom(letters)}${this.randomFrom(letters)}${Math.floor(Math.random() * 10)} ${Math.floor(Math.random() * 10)}${this.randomFrom(letters)}${this.randomFrom(letters)}`;
        }
      };
      
      return (patterns[country] || patterns['RU'])();
    },

    /**
     * Генерация ИНН (валидный)
     */
    generateINN() {
      // Упрощённая генерация ИНН (12 цифр для физлица)
      let inn = '';
      for (let i = 0; i < 10; i++) {
        inn += Math.floor(Math.random() * 10);
      }
      
      // Контрольные суммы (упрощённо)
      const checksum11 = this.calculateINNChecksum(inn, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
      const checksum12 = this.calculateINNChecksum(inn + checksum11, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
      
      return inn + checksum11 + checksum12;
    },

    calculateINNChecksum(inn, coefficients) {
      let sum = 0;
      for (let i = 0; i < coefficients.length; i++) {
        sum += parseInt(inn[i]) * coefficients[i];
      }
      return (sum % 11) % 10;
    },

    /**
     * Генерация адреса
     */
    generateAddress(country = 'RU') {
      if (country === 'RU') {
        const city = this.randomFrom(this.cities.ru);
        const street = this.randomFrom(this.streets.ru);
        const building = Math.floor(Math.random() * 200) + 1;
        const apartment = Math.floor(Math.random() * 300) + 1;
        return `${city}, ул. ${street}, д. ${building}, кв. ${apartment}`;
      } else {
        const city = this.randomFrom(this.cities.en);
        const street = this.randomFrom(this.streets.en);
        const building = Math.floor(Math.random() * 9999) + 1;
        return `${building} ${street}, ${city}`;
      }
    },

    /**
     * Генерация компании
     */
    generateCompanyName(language = 'ru') {
      const prefixes = {
        ru: ['ООО', 'ЗАО', 'ОАО', 'ИП'],
        en: ['Inc', 'LLC', 'Corp', 'Ltd']
      };
      
      const names = {
        ru: ['Рога и копыта', 'Техносервис', 'Альфа', 'Бета', 'Гамма', 'Омега', 'Прогресс', 'Инновация', 'Развитие'],
        en: ['Tech Solutions', 'Digital Systems', 'Global Trade', 'Smart Services', 'Innovation Hub']
      };
      
      const prefix = this.randomFrom(prefixes[language]);
      const name = this.randomFrom(names[language]);
      
      return language === 'ru' ? `${prefix} "${name}"` : `${name} ${prefix}`;
    },

    /**
     * Вспомогательные функции
     */
    randomFrom(array) {
      return array[Math.floor(Math.random() * array.length)];
    },

    randomDigits(count) {
      let result = '';
      for (let i = 0; i < count; i++) {
        result += Math.floor(Math.random() * 10);
      }
      return result;
    }
  };

  /**
   * Предустановленные профили данных
   */
  const DataProfiles = {
    'valid-user-ru': {
      name: 'Валидный Российский Пользователь',
      data: () => {
        const name = DataGenerators.generateRussianFullName();
        return {
          firstName: name.first,
          lastName: name.last,
          patronymic: name.patronymic,
          fullName: name.full,
          email: DataGenerators.generateRealisticEmail({ first: name.first, last: name.last }),
          phone: DataGenerators.generatePhoneByCountry('RU'),
          birthDate: DataGenerators.generateRealisticBirthDate(25, 45),
          city: DataGenerators.randomFrom(DataGenerators.cities.ru),
          address: DataGenerators.generateAddress('RU'),
          zipCode: DataGenerators.generateZipCode('RU'),
          inn: DataGenerators.generateINN()
        };
      }
    },

    'valid-user-en': {
      name: 'Valid English User',
      data: () => {
        const name = DataGenerators.generateEnglishName();
        return {
          firstName: name.first,
          lastName: name.last,
          fullName: name.full,
          email: DataGenerators.generateRealisticEmail(name),
          phone: DataGenerators.generatePhoneByCountry('US'),
          birthDate: DataGenerators.generateRealisticBirthDate(25, 45),
          city: DataGenerators.randomFrom(DataGenerators.cities.en),
          address: DataGenerators.generateAddress('EN'),
          zipCode: DataGenerators.generateZipCode('US')
        };
      }
    },

    'edge-case': {
      name: 'Edge Cases (граничные значения)',
      data: () => ({
        firstName: 'Ё', // Минимум 1 символ
        lastName: 'А'.repeat(100), // Максимум символов
        email: `a+test.very.long.email.address@extremely-long-domain-name-for-testing.com`,
        phone: '+7 (000) 000-00-00',
        birthDate: '1900-01-01', // Очень старая дата
        comment: 'Тестовый комментарий с спецсимволами: !@#$%^&*()_+-={}[]|\\:";\'<>,.?/'
      })
    },

    'xss-test': {
      name: 'XSS / Security Testing',
      data: () => ({
        firstName: `<script>alert('XSS')</script>`,
        lastName: `'; DROP TABLE users;--`,
        email: `test<script>@test.com`,
        comment: `<img src=x onerror=alert('XSS')>`,
        url: `javascript:alert('XSS')`
      })
    },

    'unicode-test': {
      name: 'Unicode / Emoji Testing',
      data: () => ({
        firstName: '测试用户',
        lastName: 'مستخدم الاختبار',
        nickname: '👨‍💻 Test User 🚀',
        comment: 'Testing emoji: 😀😃😄😁 and unicode: ñ ü ö ä'
      })
    },

    'minimal-data': {
      name: 'Минимальные Данные',
      data: () => ({
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.c',
        phone: '0'
      })
    }
  };

  /**
   * Определение контекста поля
   */
  function detectFieldContext(input) {
    const label = (input.labels?.[0]?.textContent || input.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const type = input.type || 'text';
    
    const combined = `${label} ${placeholder} ${name} ${id}`.toLowerCase();
    
    // Определение контекста
    const contexts = {
      // Имена
      firstName: /first.*name|имя|firstname|fname|given.*name|forename/i,
      lastName: /last.*name|фамилия|lastname|lname|surname|family.*name/i,
      middleName: /middle.*name|отчество|patronymic|middlename/i,
      fullName: /full.*name|полное.*имя|fio|фио/i,
      
      // Контакты
      email: /email|e-mail|почта|емейл|емэйл/i,
      phone: /phone|tel|телефон|мобильный|mobile/i,
      
      // Адрес
      address: /address|адрес|street|улица/i,
      city: /city|город|town/i,
      zipCode: /zip|postal.*code|index|индекс/i,
      country: /country|страна/i,
      
      // Даты
      birthDate: /birth.*date|дата.*рожд|birthday|дор/i,
      date: /date|дата/i,
      
      // Финансы
      creditCard: /card.*number|номер.*карт|credit.*card|debit/i,
      cvv: /cvv|cvc|код.*безопасности/i,
      inn: /инн|inn|tax.*id/i,
      
      // Компания
      company: /company|компания|organization|организация/i,
      position: /position|должность|title|job/i,
      
      // Пароли
      password: /password|пароль|pass|pwd/i,
      username: /username|login|логин|пользователь/i,
      
      // Прочее
      comment: /comment|комментарий|message|сообщение|note|примечание/i,
      url: /url|website|сайт|link/i
    };
    
    for (const [context, pattern] of Object.entries(contexts)) {
      if (pattern.test(combined) || pattern.test(type)) {
        return context;
      }
    }
    
    return 'unknown';
  }

  /**
   * Генерация значения по контексту
   */
  function generateValueByContext(context, options = {}) {
    const language = options.language || 'ru';
    
    const generators = {
      firstName: () => language === 'ru' 
        ? DataGenerators.generateRussianName().first
        : DataGenerators.generateEnglishName().first,
      
      lastName: () => language === 'ru'
        ? DataGenerators.generateRussianName().last
        : DataGenerators.generateEnglishName().last,
      
      middleName: () => DataGenerators.randomFrom(DataGenerators.russianNames.patronymic.male),
      
      fullName: () => language === 'ru'
        ? DataGenerators.generateRussianFullName().full
        : DataGenerators.generateEnglishName().full,
      
      email: () => DataGenerators.generateRealisticEmail(),
      
      phone: () => DataGenerators.generatePhoneByCountry(language === 'ru' ? 'RU' : 'US'),
      
      address: () => DataGenerators.generateAddress(language === 'ru' ? 'RU' : 'EN'),
      
      city: () => DataGenerators.randomFrom(language === 'ru' ? DataGenerators.cities.ru : DataGenerators.cities.en),
      
      zipCode: () => DataGenerators.generateZipCode(language === 'ru' ? 'RU' : 'US'),
      
      country: () => language === 'ru' ? 'Россия' : 'United States',
      
      birthDate: () => DataGenerators.generateRealisticBirthDate(18, 80),
      
      date: () => new Date().toISOString().split('T')[0],
      
      creditCard: () => DataGenerators.generateCreditCard('visa'),
      
      cvv: () => DataGenerators.randomDigits(3),
      
      inn: () => DataGenerators.generateINN(),
      
      company: () => DataGenerators.generateCompanyName(language),
      
      position: () => language === 'ru'
        ? DataGenerators.randomFrom(['Менеджер', 'Специалист', 'Руководитель', 'Аналитик'])
        : DataGenerators.randomFrom(['Manager', 'Specialist', 'Director', 'Analyst']),
      
      password: () => {
        // Генерация сложного пароля
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let pass = '';
        for (let i = 0; i < 12; i++) {
          pass += chars[Math.floor(Math.random() * chars.length)];
        }
        return pass;
      },
      
      username: () => {
        const name = DataGenerators.generateEnglishName();
        return `${name.first.toLowerCase()}${Math.floor(Math.random() * 1000)}`;
      },
      
      comment: () => language === 'ru'
        ? 'Тестовый комментарий для проверки функциональности'
        : 'Test comment for functionality testing',
      
      url: () => `https://example.com/page${Math.floor(Math.random() * 1000)}`
    };
    
    return generators[context] ? generators[context]() : null;
  }

  // Export
  window.SmartDataGenerator = {
    DataGenerators,
    DataProfiles,
    detectFieldContext,
    generateValueByContext
  };

})();
