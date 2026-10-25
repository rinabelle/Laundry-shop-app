
const orderForm = document.getElementById("orderForm");
const newOrderForm = document.getElementById("newOrderForm");
const customerTable = document.getElementById("customerTable");
const searchInput = document.getElementById("searchInput");

function openForm() {
    orderForm.hidden = false;
    orderForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function closeForm() {
    orderForm.hidden = true;
    newOrderForm.reset();
}

function updateEmptyMessage() {
    const rows = customerTable.querySelectorAll(
        "tr[data-order='true']"
    );

    const emptyMessage = document.getElementById("emptyMessage");

    if (rows.length === 0) {
        if (!emptyMessage) {
            const row = customerTable.insertRow();
            row.id = "emptyMessage";

            const cell = row.insertCell();
            cell.colSpan = 9;
            cell.className = "empty-message";
            cell.textContent =
                "No records yet. Add a new order to get started.";
        }
    } else if (emptyMessage) {
        emptyMessage.remove();
    }
}

function searchCustomers() {
    const searchText = searchInput.value.toLowerCase().trim();
    const rows = customerTable.querySelectorAll(
        "tr[data-order='true']"
    );

    rows.forEach(function (row) {
        const customerName = row.cells[1].textContent.toLowerCase();
        const orderId = row.cells[0].textContent.toLowerCase();
        const contact = row.cells[2].textContent.toLowerCase();

        row.style.display =
            customerName.includes(searchText) ||
            orderId.includes(searchText) ||
            contact.includes(searchText)
                ? ""
                : "none";
    });
}

function deleteRow(button) {
    const confirmed = confirm(
        "Are you sure you want to delete this order?"
    );

    if (confirmed) {
        button.closest("tr").remove();
        updateEmptyMessage();
        searchCustomers();
    }
}

newOrderForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const customerName =
        document.getElementById("customerName").value.trim();

    const contact =
        document.getElementById("contact").value.trim();

    const service =
        document.getElementById("service").value;

    const kilo =
        Number(document.getElementById("kilo").value);

    const price =
        Number(document.getElementById("price").value);

    const basket =
        document.getElementById("basket").value.trim();

    if (
        !customerName ||
        !contact ||
        !service ||
        !basket ||
        !Number.isFinite(kilo) ||
        !Number.isFinite(price) ||
        kilo <= 0 ||
        price < 0 ||
        !Number.isInteger(Number(basket)) ||
        Number(basket) < 1
    ) {
        alert("Please enter valid information in all fields.");
        return;
    }

    const existingRows = customerTable.querySelectorAll(
        "tr[data-order='true']"
    );

    const duplicateBasket = Array.from(existingRows).some(
        function (row) {
            return row.cells[6].textContent === basket;
        }
    );

    if (duplicateBasket) {
        alert("This basket number is already in use. Please choose another.");
        return;
    }

    const orderNumber = existingRows.length + 1;
    const orderId = "FK-" + String(orderNumber).padStart(3, "0");

    // Remove the empty message before adding a record
    const emptyMessage = document.getElementById("emptyMessage");

    if (emptyMessage) {
        emptyMessage.remove();
    }

    const row = customerTable.insertRow();
    row.dataset.order = "true";

    const values = [
        orderId,
        customerName,
        contact,
        service,
        kilo.toFixed(1),
        "₱" + price.toFixed(2),
        basket,
        "Pending"
    ];

    values.forEach(function (value) {
        const cell = row.insertCell();
        cell.textContent = value;
    });

    // Add the delete button
    const actionCell = row.insertCell();
    const deleteButton = document.createElement("button");

    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.className = "delete-btn";
    deleteButton.addEventListener("click", function () {
        deleteRow(deleteButton);
    });

    actionCell.appendChild(deleteButton);

    newOrderForm.reset();
    orderForm.hidden = true;
    searchCustomers();

    alert("Laundry order added successfully!");
});

updateEmptyMessage();
