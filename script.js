"use strict";

const sidebar = document.querySelector(".sidebar");
const form = document.querySelector(".form");
const containerWorkouts = document.querySelector(".workouts");
const inputType = document.querySelector(".form__input--type");
const inputDistance = document.querySelector(".form__input--distance");
const inputDuration = document.querySelector(".form__input--duration");
const inputCadence = document.querySelector(".form__input--cadence");
const inputElevation = document.querySelector(".form__input--elevation");
const deleteAll = document.querySelector(".deleteAll");
const sortBtn = document.querySelector(".sort");
const tip = document.querySelector(".tip");
const apiKey = "39badc712011cc7a4fac8d8e123876d2";

// Application Architecture
class App {
    #map;
    #mapEvent;
    #workouts = [];
    #workoutsBackup = [];
    #markers = [];
    #sort = false;
    #isEditing;
    #editingWorkout = null;

    constructor() {
        this._getPosition();
        this._getLocalStorage();

        deleteAll.addEventListener("click", this._deleteAll.bind(this));
        sortBtn.addEventListener("click", this._sortByDistance.bind(this));
        form.addEventListener("submit", this._newWorkout.bind(this));
        inputType.addEventListener("change", this._toggleElevationField);
        containerWorkouts.addEventListener(
            "click",
            this._moveToPopup.bind(this)
        );

        inputType.addEventListener("change", function () {
            if (inputType.value === "running") {
                inputCadence.focus();
            } else {
                inputElevation.focus();
            }
        });
    }

    //initializes the map
    _getPosition() {
        if (navigator.geolocation)
            navigator.geolocation.getCurrentPosition(
                this._loadMap.bind(this),
                function () {
                    alert("Could not get your location");
                }
            );
    }

    _loadMap(position) {
        const { latitude } = position.coords;
        const { longitude } = position.coords;
        const coords = [latitude, longitude];

        this.#map = L.map("map").setView(coords, 13);

        L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(this.#map);

        // Showing the form
        this.#map.on("click", this._showForm.bind(this));

        this.#workouts.forEach((work) => {
            this._renderWorkoutMarker(work);
        });
    }

    _showForm(mapE) {
        tip.style.display = "none";
        this.#mapEvent = mapE;
        form.classList.remove("hidden");
        inputDistance.focus();
    }

    _toggleElevationField() {
        inputElevation
            .closest(".form__row")
            .classList.toggle("form__row--hidden");

        inputCadence
            .closest(".form__row")
            .classList.toggle("form__row--hidden");

        inputCadence.value = inputElevation.value = "";
    }

    async _newWorkout(e) {
        // Helping functions
        const validInput = (...inputs) =>
            inputs.every((input) => Number.isFinite(input));
        const isPositive = (...inputs) => inputs.every((input) => input > 0);

        e.preventDefault();

        // Get the data from form
        const type = inputType.value;
        const distance = +inputDistance.value;
        const duration = +inputDuration.value;
        let cadence = 0;
        let elevation = 0;

        let coords;
        if (this.#editingWorkout) {
            coords = this.#editingWorkout.coords;
        } else {
            if (!this.#mapEvent) return alert("Select a location on map");
            coords = [this.#mapEvent.latlng.lat, this.#mapEvent.latlng.lng];
        }

        // if workout running, Create running object
        if (type === "running") {
            cadence = +inputCadence.value;
            elevation = null;

            // Check if data is valid
            if (
                !validInput(distance, duration, cadence) ||
                !isPositive(distance, duration, cadence)
            )
                return alert("Inputs should be a positive number!");
        }

        // if workout cycling, Create cycling object
        if (type === "cycling") {
            elevation = +inputElevation.value;
            cadence = null;

            // CHeck if data is valid
            if (
                !validInput(
                    distance,
                    duration,
                    elevation || !isPositive(distance, duration)
                )
            )
                return alert("Inputs should be a positive number!");
        }

        if (this.#editingWorkout) {
            // updating the existing workout if there is

            let updatedWorkout;
            if (type === "running") {
                updatedWorkout = new Running(
                    distance,
                    duration,
                    cadence,
                    coords
                );
                updatedWorkout.temp = this.#editingWorkout.temp;
            } else if (type === "cycling") {
                updatedWorkout = new Cycling(
                    distance,
                    duration,
                    elevation,
                    coords
                );
                updatedWorkout.temp = this.#editingWorkout.temp;
            }
            const index = this.#workouts.findIndex(
                (work) => work.id === this.#editingWorkout.id
            );

            this.#map.removeLayer(this.#markers[index]);

            this.#markers[index] = L.marker(updatedWorkout.coords)
                .addTo(this.#map)
                .bindPopup(
                    L.popup({
                        maxWidth: 250,
                        minWidth: 100,
                        autoClose: false,
                        closeOnClick: false,
                        className: `${updatedWorkout.type}-popup`,
                    })
                )
                .setPopupContent(
                    `${updatedWorkout.type === "running" ? "🏃‍♂️" : "🚴"} ${
                        updatedWorkout.description
                    }`
                )
                .openPopup();

            this.#workouts[index] = updatedWorkout;
        } else {
            let workout;

            // create a brand new workout
            if (type === "running") {
                workout = new Running(distance, duration, cadence, coords);
            } else {
                workout = new Cycling(distance, duration, elevation, coords);
            }

            this.#workouts.push(workout);

            // Getting weather
            const [lat, lng] = workout.coords;
            const WEATHER_API_URL = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}`;

            try {
                const res = await fetch(WEATHER_API_URL);
                const data = await res.json();
                workout.temp = (data.main.temp - 273.15).toFixed(0);
            } catch (error) {
                console.log(error);
            }
            // render workout to map as marker
            this._renderWorkoutMarker(workout);
        }

        this.#editingWorkout = null;
        this.#isEditing = false;

        // render workout on list and remove old ones
        document.querySelectorAll(".workout").forEach((work) => work.remove());
        this.#workouts.forEach((work) => this._renderWorkout(work));

        // hide the form
        this._hideForm();
        // Set local Storage to all workout
        this._setLocalStorage();
    }

    _renderWorkoutMarker(workout) {
        let mark = L.marker(workout.coords)
            .addTo(this.#map)
            .bindPopup(
                L.popup({
                    maxWidth: 250,
                    minWidth: 100,
                    autoClose: false,
                    closeOnClick: false,
                    className: `${workout.type}-popup`,
                })
            )
            .setPopupContent(
                `${workout.type === "running" ? "🏃‍♂️" : "🚴"} ${
                    workout.description
                }`
            )
            .openPopup();
        this.#markers.push(mark);
    }

    _renderWorkout(workout) {
        let html = `
        <li class="workout workout--${workout.type}" data-id="${workout.id}">
          <h2 class="workout__title">${workout.description} &nbsp; ● &nbsp; ${
            workout.temp
        }&deg;C</h2>
          
            <div class="btns">
            <i class="ri-close-circle-line deleteBtn" title="Delete workout"></i> 
            <i class="ri-pencil-line editBtn" title="Edit workout"></i>
            </div>
          <div class="workout__details">
            <span class="workout__icon">${
                workout.type === "running" ? "🏃‍♂️" : "🚴"
            }</span>
            <span class="workout__value">${workout.distance}</span>
            <span class="workout__unit">km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⌛</span>
            <span class="workout__value">${workout.duration}</span>
            <span class="workout__unit">min</span>
          </div>`;

        if (workout.type === "running") {
            html += `
            <div class="workout__details">
              <span class="workout__icon">⚡️</span>
                <span class="workout__value">${workout.pace.toFixed(1)}</span>
                <span class="workout__unit">min/km</span>
            </div>
            <div class="workout__details">
                <span class="workout__icon">🦶🏼</span>
                <span class="workout__value">${workout.cadence}</span>
                <span class="workout__unit">spm</span>
            </div>
            </li>`;
        }

        if (workout.type === "cycling") {
            html += `
            <div class="workout__details">
                <span class="workout__icon">⚡️</span>
                <span class="workout__value">${workout.speed.toFixed(1)}</span>
                <span class="workout__unit">km/h</span>
            </div>
            <div class="workout__details">
                <span class="workout__icon">⛰️</span>
                <span class="workout__value">${workout.elevation}</span>
                <span class="workout__unit">m</span>
            </div>
            </li>`;
        }
        form.insertAdjacentHTML("afterend", html);
    }

    _hideForm() {
        inputDistance.value =
            inputCadence.value =
            inputDuration.value =
            inputElevation.value =
                "";

        form.style.display = "none";
        form.classList.add("hidden");
        setTimeout(() => (form.style.display = "grid"), 1000);
    }

    _moveToPopup(e) {
        const dlt = e.target.closest(".deleteBtn");
        const edit = e.target.closest(".editBtn");
        const workoutEl = e.target.closest(".workout");

        if (edit) {
            this._editWorkout(workoutEl);
            return;
        }

        if (dlt) {
            this._deleteWorkout(workoutEl);
            return;
        }

        if (!workoutEl) return;

        const workout = this.#workouts.find(
            (work) => work.id === workoutEl.dataset.id
        );
        this.#map.setView(workout.coords, 13, {
            animate: true,
            pan: {
                duration: 1,
            },
        });
    }

    _setLocalStorage() {
        localStorage.setItem("workouts", JSON.stringify(this.#workouts));
    }

    _getLocalStorage() {
        const data = JSON.parse(localStorage.getItem("workouts"));

        if (!data) return;

        this.#workouts = data.map((work) => {
            if (work.type === "running") {
                return new Running(
                    work.distance,
                    work.duration,
                    work.cadence,
                    work.coords,
                    work.temp
                );
            }
            if (work.type === "cycling") {
                return new Cycling(
                    work.distance,
                    work.duration,
                    work.elevation,
                    work.coords,
                    work.temp
                );
            }
        });

        // Linking the objects back to their class
        this.#workouts.forEach((work) => this._renderWorkout(work));
    }

    _sortByDistance() {
        if (!this.#sort) {
            this.#sort = true;
            const sortedWorkouts = [...this.#workouts].sort(
                (a, b) => a.distance - b.distance
            );

            document
                .querySelectorAll(".workout")
                .forEach((work) => work.remove());
            sortedWorkouts.forEach((work) => this._renderWorkout(work));
        } else {
            this.#sort = false;
            document
                .querySelectorAll(".workout")
                .forEach((work) => work.remove());

            this.#workouts.forEach((work) => this._renderWorkout(work));
        }
    }

    _deleteAll() {
        tip.style.display = "";
        if (this.#workouts.length === 0) return;

        this.#markers.forEach((marker) => this.#map.removeLayer(marker)); //removing from map
        this.#markers = [];
        document.querySelectorAll(".workout").forEach((work) => work.remove());
        this.#workouts.splice(0, this.#workouts.length);
        localStorage.removeItem("workouts");
    }

    _deleteWorkout(workout) {
        const workoutId = workout.dataset.id;

        // Getting the index and removing workout
        const index = this.#workouts.findIndex((work) => work.id === workoutId);
        this.#map.removeLayer(this.#markers[index]); // removing from map
        this.#workouts.splice(index, index === 0 ? index + 1 : index); // removing from #workouts array
        workout.style.display = "none"; // removing from the list
        if (this.#workouts.length === 0) tip.style.display = "";

        // Updating the local Storage
        const storageData = JSON.parse(localStorage.getItem("workouts"));
        const filtered = storageData.filter((work) => work.id != workoutId);
        localStorage.setItem("workouts", JSON.stringify(filtered));
    }

    _editWorkout(workout) {
        if (this.#editingWorkout) {
            alert("First edit this one");
            return;
        }

        this.#editingWorkout = this.#workouts.find(
            (work) => workout.dataset.id === work.id
        );

        // updating the form
        workout.style.display = "none";
        form.classList.remove("hidden");
        inputDistance.focus();
        inputType.value = this.#editingWorkout.type;
        inputDistance.value = this.#editingWorkout.distance;
        inputDuration.value = this.#editingWorkout.duration;
        if (this.#editingWorkout.type === "cycling") {
            this._toggleElevationField();
            inputElevation.value = this.#editingWorkout.elevation;
        }

        if (this.#editingWorkout.type === "running") {
            inputCadence.value = this.#editingWorkout.cadence;
        }
    }
}

class Workout {
    date = new Date();

    id = (
        Math.trunc(Math.random() * (2000000 - 1000000) + 1) + 1000000
    ).toString(16);

    constructor(distance, duration, coords, temp) {
        this.distance = distance;
        this.duration = duration;
        this.coords = coords; // [lat, lng]
        this.temp = temp;
    }

    _setDescription() {
        // prettier-ignore
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        this.description = `${this.type[0].toUpperCase()}${this.type.slice(
            1
        )} on ${months[this.date.getMonth()]} ${this.date.getDate()}`;
    }
}

class Running extends Workout {
    type = "running";
    constructor(distance, duration, cadence, coords, temp) {
        super(distance, duration, coords, temp);
        this.cadence = cadence;
        this.calcPace();
        this._setDescription();
    }

    calcPace() {
        this.pace = this.duration / this.distance;
        return this.pace;
    }
}

class Cycling extends Workout {
    type = "cycling";
    constructor(distance, duration, elevation, coords, temp) {
        super(distance, duration, coords, temp);
        this.elevation = elevation;
        this.calcSpeed();
        this._setDescription();
    }

    calcSpeed() {
        this.speed = this.distance / (this.duration / 60);
        return this.speed;
    }
}

const app = new App();
